/**
 * Photo proof: kept in app storage until the server has it. A camera's own
 * cache can be cleared by the phone at any time, so the captured file is
 * copied somewhere the app owns and only deleted after a successful upload.
 */
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { api } from "./api";
import type { QueuedProof } from "./types";

/** Copies a freshly captured photo into app storage and returns its new uri. */
export function keepPhoto(tempUri: string, id: string): string {
  if (Platform.OS === "web") return tempUri;
  const folder = new Directory(Paths.document, "proofs");
  if (!folder.exists) folder.create({ intermediates: true });
  const target = new File(folder, `${id}.jpg`);
  new File(tempUri).copy(target);
  return target.uri;
}

export async function discardPhoto(uri: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone: nothing to clean.
  }
}

export async function uploadProof(proof: QueuedProof): Promise<void> {
  const form = new FormData();
  form.append("job", proof.job_id);
  form.append("kind", "PHOTO");
  // React Native's FormData takes a file as { uri, name, type }.
  form.append("file", { uri: proof.uri, name: `${proof.id}.jpg`, type: "image/jpeg" } as never);
  await api.post("/fulfilment/proofs", form);
}
