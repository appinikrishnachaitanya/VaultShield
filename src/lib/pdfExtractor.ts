import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export type PdfExtractResult = {
  text: string;
  pageCount: number;
  method: "text-layer" | "image-ocr-needed";
  images: Array<{ data: string; mimeType: string; name: string; url: string }>;
};

export async function extractPdfContent(
  file: File,
): Promise<PdfExtractResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;

  const textParts: string[] = [];
  const images: PdfExtractResult["images"] = [];

  for (let pageNum = 1; pageNum <= Math.min(pageCount, 10); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText.length > 30) {
      textParts.push(pageText);
    } else {
      // No text layer — render page to canvas for OCR
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL("image/png");
      const data = dataUrl.split(",")[1];
      images.push({
        data,
        mimeType: "image/png",
        name: `${file.name} – page ${pageNum}`,
        url: dataUrl,
      });
    }
  }

  const combinedText = textParts.join("\n\n");

  return {
    text: combinedText,
    pageCount,
    method: combinedText.length > 30 ? "text-layer" : "image-ocr-needed",
    images,
  };
}
