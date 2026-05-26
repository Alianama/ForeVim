export type { ReportFormat, ReportSectionId, ReportSection, ReportConfig, ReportData, VmWithMetrics, TopMetricEntry } from "./types";
export { DEFAULT_SECTIONS } from "./types";
export { generateCSV } from "./csv";
export { generateExcel } from "./excel";
export { generatePDF } from "./pdf";
export { generatePPTX } from "./pptx";
export { generateWord } from "./word";

import type { ReportData, ReportFormat } from "./types";
import { generateCSV } from "./csv";
import { generateExcel } from "./excel";
import { generatePDF } from "./pdf";
import { generatePPTX } from "./pptx";
import { generateWord } from "./word";

export async function generateReport(data: ReportData, format: ReportFormat): Promise<void> {
  switch (format) {
    case "csv": return generateCSV(data);
    case "xlsx": return generateExcel(data);
    case "pdf": return generatePDF(data);
    case "pptx": return generatePPTX(data);
    case "docx": return generateWord(data);
  }
}
