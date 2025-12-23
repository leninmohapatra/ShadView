import Papa from "papaparse";

export function parseCsv(csvText: string) {
  return Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: "greedy",
    comments: "#",            // ✅ ignores "# Exported by ..."
  });
}
