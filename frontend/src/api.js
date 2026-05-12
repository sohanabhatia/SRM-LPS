const BASE_URL = "http://localhost:8000";

export async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/upload`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
  return res.json();
}

export async function processFile(file_path, lpsClass) {
  const res = await fetch(`${BASE_URL}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_path, lpsClass }),
  });
  if (!res.ok) throw new Error(`Processing failed: ${res.statusText}`);
  return res.json();
}

export const exportDwg = async (filePath, lpsClass) => {
  const res = await fetch(`${BASE_URL}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_path: filePath, lpsClass }),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
  return res.blob();
};