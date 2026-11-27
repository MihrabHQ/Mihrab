import PDFKit
let u = URL(fileURLWithPath: CommandLine.arguments[1])
print(PDFDocument(url: u)?.pageCount ?? 0)
