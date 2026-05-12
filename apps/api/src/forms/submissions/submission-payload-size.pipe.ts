import {
  Injectable,
  PayloadTooLargeException,
  PipeTransform,
} from "@nestjs/common";

export const MAX_VALUES_BYTES = 1024 * 1024; // 1 MiB

@Injectable()
export class SubmissionPayloadSizePipe implements PipeTransform<unknown> {
  transform(body: unknown): unknown {
    let json: string;
    try {
      json = JSON.stringify(body);
    } catch {
      throw new PayloadTooLargeException("Body could not be serialised");
    }
    if (json.length > MAX_VALUES_BYTES) {
      throw new PayloadTooLargeException(
        `Submission body exceeds ${MAX_VALUES_BYTES} bytes`,
      );
    }
    return body;
  }
}
