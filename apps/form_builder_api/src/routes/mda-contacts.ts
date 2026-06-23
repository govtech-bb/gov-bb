import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { MdaContactEntity } from "@govtech-bb/database";
import { getDataSource } from "../db.js";

export const mdaContactsRouter = Router();

// Public department address. Mirrors the MdaContactAddress shape in
// @govtech-bb/database and the form-types `contactDetails` address subset.
const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  country: z.string().optional(),
});

// Create body — every field required except `address`. `email` and `mdaEmail`
// are validated as emails so a malformed recipient is caught at the boundary.
const createMdaContactSchema = z.object({
  label: z.string().min(1),
  title: z.string().min(1),
  telephone: z.string().min(1),
  email: z.string().email(),
  address: addressSchema.optional(),
  mdaEmail: z.string().email(),
});

// GET /builder/mda-contacts — the full contact directory (includes the private
// mdaEmail; this router sits behind the /builder admin-token middleware).
export async function listMdaContactsHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const ds = await getDataSource();
    const repo = ds.getRepository(MdaContactEntity);
    const contacts = await repo.find();
    res.json(
      contacts.map((c) => ({
        id: c.id,
        label: c.label,
        title: c.title,
        telephone: c.telephone,
        email: c.email,
        address: c.address ?? null,
        mdaEmail: c.mdaEmail,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
mdaContactsRouter.get("/", listMdaContactsHandler);

// POST /builder/mda-contacts — add a contact to the directory. Returns the full
// created record (with its generated id) so the builder can select it.
export async function createMdaContactHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = createMdaContactSchema.safeParse(req.body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    res.status(400).json({ error: detail || "Invalid request body" });
    return;
  }
  try {
    const ds = await getDataSource();
    const repo = ds.getRepository(MdaContactEntity);
    const entity = repo.create({
      label: parsed.data.label,
      title: parsed.data.title,
      telephone: parsed.data.telephone,
      email: parsed.data.email,
      address: parsed.data.address ?? null,
      mdaEmail: parsed.data.mdaEmail,
    });
    const saved = await repo.save(entity);
    res.status(201).json({
      id: saved.id,
      label: saved.label,
      title: saved.title,
      telephone: saved.telephone,
      email: saved.email,
      address: saved.address ?? null,
      mdaEmail: saved.mdaEmail,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
mdaContactsRouter.post("/", createMdaContactHandler);
