import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";
import type { Primitive, ServiceContract } from "@govtech-bb/form-types";
import { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import { isValidSecretToken } from "../common/secret-token";
import type {
  SubmissionValues,
  ValidationErrorBundle,
} from "../forms/submissions/submissions.types";
import type {
  ConfirmUploadDto,
  FileAttachmentDto,
  PresignUploadDto,
  PresignUploadResponseDto,
} from "./dto";

/** A durable uploaded-file reference collected from submitted values. */
export interface SubmissionFileEntry {
  key: string;
  name: string;
  size: number;
  type: string;
}

@Injectable()
export class FilesService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly globalMaxSize: number;
  private readonly presignTtl: number;
  private readonly readTtl: number;

  constructor(
    private readonly config: ConfigService,
    private readonly formDefs: FormDefinitionsService,
  ) {
    const region = this.config.get<string>("upload.region")!;
    const endpoint = this.config.get<string | undefined>("upload.endpoint");
    const forcePathStyle = this.config.get<boolean>("upload.forcePathStyle");
    // Static creds only when talking to a custom endpoint (LocalStack/dev).
    // Production leaves credentials unset so the SDK uses the IAM role.
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const useStaticCreds = !!endpoint && !!accessKeyId && !!secretAccessKey;
    this.s3 = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: !!forcePathStyle } : {}),
      ...(useStaticCreds
        ? {
            credentials: {
              accessKeyId: accessKeyId!,
              secretAccessKey: secretAccessKey!,
            },
          }
        : {}),
    });
    this.bucket = this.config.get<string>("upload.bucket") ?? "";
    this.globalMaxSize = this.config.get<number>("upload.maxSizeBytes")!;
    this.presignTtl = this.config.get<number>("upload.presignTtlSeconds")!;
    this.readTtl = this.config.get<number>("upload.readUrlTtlSeconds")!;
  }

  async presignUpload(
    dto: PresignUploadDto,
    previewToken?: string,
    draftToken?: string,
  ): Promise<PresignUploadResponseDto> {
    this.assertConfigured();
    const field = await this.resolveFileField(
      dto.formId,
      dto.stepId,
      dto.fieldId,
      this.isValidRecipeToken(previewToken),
      this.isValidRecipeToken(draftToken),
    );

    this.assertContentTypeAllowed(field, dto.contentType, dto.fileName);
    const maxSize = this.resolveMaxSize(field);
    if (dto.size > maxSize) {
      throw new BadRequestException(`File exceeds max size (${maxSize} bytes)`);
    }

    const key = this.buildKey(
      dto.formId,
      dto.stepId,
      dto.fieldId,
      dto.fileName,
    );
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.contentType,
      ContentLength: dto.size,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.presignTtl,
    });

    return { uploadUrl, key, expiresIn: this.presignTtl, maxSize };
  }

  async confirmUpload(
    dto: ConfirmUploadDto,
    previewToken?: string,
    draftToken?: string,
  ): Promise<FileAttachmentDto> {
    this.assertConfigured();
    // Bind confirm to presign (#284): the key embeds the (formId, stepId,
    // fieldId) it was presigned under. Reject when the client confirms under a
    // different field than the key was issued for — otherwise a caller could
    // presign a lenient field and confirm under a stricter one to dodge its
    // content-type/size policy. A caller can only HeadObject-confirm a key they
    // actually presigned, so the embedded tuple is authoritative. Legacy
    // tuple-less keys (in flight across deploy) skip the check and fall back to
    // the prior client-supplied behaviour.
    const keyTuple = this.parseKeyTuple(dto.key);
    if (
      keyTuple &&
      (keyTuple.formId !== dto.formId ||
        keyTuple.stepId !== dto.stepId ||
        keyTuple.fieldId !== dto.fieldId)
    ) {
      throw new BadRequestException(
        "Upload key does not match the confirmed field",
      );
    }
    const field = await this.resolveFileField(
      dto.formId,
      dto.stepId,
      dto.fieldId,
      this.isValidRecipeToken(previewToken),
      this.isValidRecipeToken(draftToken),
    );

    let head;
    try {
      head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: dto.key }),
      );
    } catch {
      throw new NotFoundException("Upload not found");
    }

    const name = this.extractOriginalName(dto.key);
    const size = head.ContentLength ?? 0;
    const type = head.ContentType ?? "application/octet-stream";

    // S3 echoes the PUT's Content-Type/Length headers without enforcing or
    // sniffing — re-check against the field's policy here.
    const maxSize = this.resolveMaxSize(field);
    if (size > maxSize) {
      throw new BadRequestException(
        `Uploaded file exceeds max size (${maxSize} bytes)`,
      );
    }
    this.assertContentTypeAllowed(field, type, name);

    const url = await this.getSignedReadUrl(dto.key);
    return { key: dto.key, url, name, size, type };
  }

  async verifyKeysExist(keys: string[]): Promise<Set<string>> {
    this.assertConfigured();
    const missing = new Set<string>();
    // Cap concurrency to avoid saturating S3 and turning throttling into
    // false "missing" errors. Throttle errors are re-raised, not swallowed.
    const CONCURRENCY = 10;
    for (let i = 0; i < keys.length; i += CONCURRENCY) {
      const batch = keys.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (key) => {
          try {
            await this.s3.send(
              new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
            );
          } catch (err: unknown) {
            const name = (err as { name?: string } | null)?.name;
            if (name && /Throttl|SlowDown|Limit/i.test(name)) throw err;
            missing.add(key);
          }
        }),
      );
    }
    return missing;
  }

  /**
   * Walks every form contract once to find the file-typed field ids per step.
   * The pipeline passes this map to both `verifySubmissionFiles` (S3 existence
   * check) and `normalizeForStorage` (URL stripping) — one walk, one source
   * of truth.
   */
  static collectFileFieldsByStep(
    contract: ServiceContract,
  ): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    for (const step of contract.steps) {
      const ids = step.elements
        .filter((e) => "htmlType" in e && e.htmlType === "file")
        .map((e) => (e as { fieldId: string }).fieldId);
      if (ids.length > 0) out.set(step.stepId, new Set(ids));
    }
    return out;
  }

  /**
   * The single walk over `fileFieldsByStep × values` — one row per item in a
   * file field's array, across repeatable-step instances. Keyless items
   * (incomplete uploads) are yielded too; each consumer applies its own key
   * policy (`collectFileEntries` skips them, `verifySubmissionFiles` reports
   * them).
   */
  private static *walkFileItems(
    fileFieldsByStep: Map<string, Set<string>>,
    values: SubmissionValues,
  ): Generator<{
    stepId: string;
    instanceIndex: number;
    fieldId: string;
    isRepeatable: boolean;
    item: Record<string, unknown>;
  }> {
    for (const [stepId, fieldIds] of fileFieldsByStep) {
      const stepVal = values[stepId];
      if (stepVal === undefined) continue;
      const isRepeatable = Array.isArray(stepVal);
      const instances = isRepeatable ? stepVal : [stepVal];
      for (const [instanceIndex, inst] of instances.entries()) {
        for (const fieldId of fieldIds) {
          const arr = inst[fieldId];
          if (!Array.isArray(arr)) continue;
          for (const item of arr as Array<Record<string, unknown>>) {
            yield { stepId, instanceIndex, fieldId, isRepeatable, item };
          }
        }
      }
    }
  }

  /**
   * Collects every uploaded-file entry from submitted values for the
   * file-typed fields in `fileFieldsByStep` (see `collectFileFieldsByStep`).
   * Entries without a durable `key` (incomplete uploads) are skipped.
   */
  static collectFileEntries(
    fileFieldsByStep: Map<string, Set<string>>,
    values: SubmissionValues,
  ): SubmissionFileEntry[] {
    const entries: SubmissionFileEntry[] = [];
    for (const { item } of FilesService.walkFileItems(
      fileFieldsByStep,
      values,
    )) {
      if (typeof item?.key !== "string" || item.key.length === 0) continue;
      entries.push({
        key: item.key,
        name:
          typeof item.name === "string" && item.name.length > 0
            ? item.name
            : (item.key.split("/").pop() ?? item.key),
        size: typeof item.size === "number" ? item.size : 0,
        type:
          typeof item.type === "string" && item.type.length > 0
            ? item.type
            : "application/octet-stream",
      });
    }
    return entries;
  }

  /** Downloads an uploaded object's bytes (e.g. to attach to an email). */
  async getObjectBytes(key: string): Promise<Buffer> {
    this.assertConfigured();
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!res.Body) {
      throw new NotFoundException(`Uploaded object has no body: ${key}`);
    }
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async verifySubmissionFiles(
    fileFieldsByStep: Map<string, Set<string>>,
    values: SubmissionValues,
  ): Promise<ValidationErrorBundle> {
    if (fileFieldsByStep.size === 0) return {};

    interface Location {
      stepId: string;
      instanceIndex: number;
      fieldId: string;
      isRepeatable: boolean;
    }
    const locations: Array<{ key: string; loc: Location }> = [];
    const keyless: Location[] = [];

    for (const { item, ...loc } of FilesService.walkFileItems(
      fileFieldsByStep,
      values,
    )) {
      if (typeof item.key === "string" && item.key.length > 0) {
        locations.push({ key: item.key, loc });
      } else {
        keyless.push(loc);
      }
    }

    if (locations.length === 0 && keyless.length === 0) return {};

    const missingKeys =
      locations.length > 0
        ? await this.verifyKeysExist(locations.map((l) => l.key))
        : new Set<string>();
    if (missingKeys.size === 0 && keyless.length === 0) return {};

    const errorLocs: Location[] = [
      ...locations.filter((l) => missingKeys.has(l.key)).map((l) => l.loc),
      ...keyless,
    ];

    // Pad `{}` for clean instances based on the max index seen across all
    // locations, matching foldErrors' bundle shape for repeatable steps.
    const maxIndexByStep = new Map<string, number>();
    const allLocs: Location[] = [...locations.map((l) => l.loc), ...keyless];
    for (const loc of allLocs) {
      if (!loc.isRepeatable) continue;
      const prev = maxIndexByStep.get(loc.stepId) ?? -1;
      if (loc.instanceIndex > prev)
        maxIndexByStep.set(loc.stepId, loc.instanceIndex);
    }

    const bundle: ValidationErrorBundle = {};
    const pushErr = (loc: Location) => {
      if (loc.isRepeatable) {
        const slot = (bundle[loc.stepId] ??= { instances: [] }) as {
          instances: Array<Record<string, string[]>>;
        };
        const targetLen = (maxIndexByStep.get(loc.stepId) ?? 0) + 1;
        while (slot.instances.length < targetLen) slot.instances.push({});
        const inst = slot.instances[loc.instanceIndex]!;
        (inst[loc.fieldId] ??= []).push("Uploaded file not found");
      } else {
        const slot = (bundle[loc.stepId] ??= {}) as Record<string, string[]>;
        (slot[loc.fieldId] ??= []).push("Uploaded file not found");
      }
    };
    for (const loc of errorLocs) pushErr(loc);
    return bundle;
  }

  async getSignedReadUrl(key: string, ttlSeconds?: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, {
      expiresIn: ttlSeconds ?? this.readTtl,
    });
  }

  private assertConfigured(): void {
    if (!this.bucket) {
      throw new BadRequestException("Uploads not configured");
    }
  }

  /**
   * Mirrors the form-GET path (#1682): both the `X-Recipe-Preview` and
   * `X-Recipe-Draft` tokens validate against the same `RECIPE_PREVIEW_TOKEN`. A
   * missing or invalid token leaves behaviour exactly as before (published
   * recipes only, visibility gate enforced).
   */
  private isValidRecipeToken(token?: string): boolean {
    return isValidSecretToken(
      this.config.get<string>("RECIPE_PREVIEW_TOKEN", ""),
      token,
    );
  }

  private async resolveFileField(
    formId: string,
    stepId: string,
    fieldId: string,
    // Mirror the form-GET sourcing so the file-field config matches the recipe
    // the citizen/reviewer loaded: bypassVisibility serves a non-public
    // published recipe; draft sources the in-progress DB scratch (#1682).
    bypassVisibility = false,
    draft = false,
  ): Promise<Primitive> {
    let contract;
    try {
      contract = await this.formDefs.findByFormId({
        formId,
        bypassVisibility,
        draft,
      });
    } catch {
      throw new BadRequestException(`Form not found: ${formId}`);
    }
    const step = contract.steps.find((s) => s.stepId === stepId);
    if (!step) {
      throw new BadRequestException(`Unknown step: ${stepId}`);
    }
    const field = step.elements.find(
      (e): e is Primitive => "fieldId" in e && e.fieldId === fieldId,
    );
    if (!field) {
      throw new BadRequestException(`Unknown file field: ${stepId}.${fieldId}`);
    }
    if (field.htmlType !== "file") {
      throw new BadRequestException(
        `Field is not a file field: ${stepId}.${fieldId}`,
      );
    }
    return field;
  }

  private assertContentTypeAllowed(
    field: Primitive,
    contentType: string,
    fileName: string,
  ): void {
    const allowed = field.validations?.fileTypes?.value as string[] | undefined;
    if (!allowed || allowed.length === 0) return;

    // Allowlist entries starting with "." are extension patterns; everything
    // else is a MIME type. A file is accepted if EITHER matches — users
    // typically configure `[".pdf", "application/pdf"]` meaning "PDFs OK".
    // Note: contentType is client-supplied (S3 does not sniff bytes), so this
    // is policy enforcement, not malware defense.
    const lc = allowed.map((s) => s.toLowerCase());
    const parts = fileName.split(".");
    const ext =
      parts.length > 1 ? `.${parts[parts.length - 1]!.toLowerCase()}` : "";

    if (lc.includes(contentType.toLowerCase()) || lc.includes(ext)) return;

    throw new BadRequestException(
      `Content type ${contentType} not allowed for this field`,
    );
  }

  private resolveMaxSize(field: Primitive): number {
    const fromValidation = field.validations?.itemMaxSize?.value as
      | number
      | undefined;
    return typeof fromValidation === "number" && fromValidation > 0
      ? fromValidation
      : this.globalMaxSize;
  }

  // The (formId, stepId, fieldId) tuple is embedded in the key prefix so confirm
  // can verify the upload was presigned under the same field — closing the
  // presign↔confirm binding gap (#284). stepId/fieldId are DTO-validated as
  // path-safe slugs, so they can't inject extra path segments.
  private buildKey(
    formId: string,
    stepId: string,
    fieldId: string,
    fileName: string,
  ): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `uploads/${formId}/${stepId}/${fieldId}/${yyyy}/${mm}/${uuid()}-${this.sanitizeFileName(
      fileName,
    )}`;
  }

  // Parse the (formId, stepId, fieldId) tuple embedded by buildKey. Returns the
  // tuple for a new-format key, or null for a legacy (tuple-less) key still in
  // flight across deploy. Only the exact buildKey shape matches — a forged key
  // can't claim a tuple it wasn't presigned with.
  private parseKeyTuple(
    key: string,
  ): { formId: string; stepId: string; fieldId: string } | null {
    const m = key.match(
      /^uploads\/([a-z0-9-]+)\/([a-z0-9-]+)\/([A-Za-z0-9_-]+)\/\d{4}\/\d{2}\//i,
    );
    return m ? { formId: m[1], stepId: m[2], fieldId: m[3] } : null;
  }

  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9._-]/g, "");
  }

  private extractOriginalName(key: string): string {
    const last = key.split("/").pop() ?? key;
    return last.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/,
      "",
    );
  }
}
