import { Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib'
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import {
  createUniqueId,
  extractDoc,
  findAttestation,
  getAllFiles,
  getUniqueLines,
  getStartPositionForLine,
  stripLeadingBracketAndTrailingDot
} from "./util";
import { Logger } from '@nestjs/common';

const END_OF_ATTESTATIONS_MARKER = "END_OF_ATTESTATIONS";

const topMargin = 114;
const bottomMargin = 800
const textSizeMin = 5;
const textSizeMax = 10;

const textSizeOffset = 3
const textLength = 540

const regex = /^\[*II\.[\d+]\.[^\s+]*/g

const ehcPath = `${process.cwd()}/ehcs`;
const dataPath = `${process.cwd()}/data`;
const requestPath = `${process.cwd()}/requests`;

const startLineRuleMarkers = ["either", "and", "or", "and/or"]

@Injectable()
export class AppService {

  async indexPdfs() {

    Logger.log("Starting indexing process")

    const files = getAllFiles(ehcPath)

    for (let i = 0; i < files.length; i++) {

      const filename = files[i]

      if(!filename.endsWith("pdf")){
        continue
      }

      Logger.log(`Indexing File ${filename}`)

      const dataFile = filename.replace(ehcPath, dataPath).replace("pdf", "json")

      const doc = await extractDoc(filename, {disableCombineTextItems: false, normalizeWhitespace: true})

      let attestations = [];
      let ids = []

      for (let i = 0; i < doc.pages.length; i++) {
        const page = doc.pages[i]
        const content = page.content
        const scannedLines = new Set()
        for (let j = 0; j < content.length; j++) {
          const line = content[j]
          const lineNum = Math.round(line.y)
          const absoluteY = Math.round((page.pageInfo.num - 1) * (page.pageInfo.height) + line.y)
          let matched = line.str.match(regex)
          if (!Array.from(scannedLines).includes(lineNum)) {
            if (matched) {
              const name = stripLeadingBracketAndTrailingDot(matched[0].trim())
              let id = createUniqueId(name, ids);
              attestations.push({
                id: id,
                name: name,
                startY: lineNum,
                endY: undefined,
                absoluteY: absoluteY,
                startPage: page.pageInfo.num,
              })
            }
          }
          if (line.str !== "[" && line.str.trim().length > 0 && !startLineRuleMarkers.includes(line.str)) {
            scannedLines.add(lineNum)
          }
          if (line.str.startsWith("[")) {
            scannedLines.delete(lineNum)
          }
          if (line.str.trim() === "Notes" || line.str.trim() === "otes") {
            attestations.push({
              name: END_OF_ATTESTATIONS_MARKER,
              startY: lineNum,
              endY: undefined,
              absoluteY: absoluteY,
              startPage: page.pageInfo.num,
              endPage: undefined,
              absoluteEndY: undefined
            })
            break
          }
        }
        if (attestations[attestations.length - 1] && attestations[attestations.length - 1].name === END_OF_ATTESTATIONS_MARKER) {
          break
        }
      }

      attestations.forEach((attestation, i) => {
        const nextAttestation = attestations[i + 1]
        if (nextAttestation) {
          attestation.endY = nextAttestation.startY
          attestation.endPage = nextAttestation.startPage
          attestation.absoluteEndY = nextAttestation.absoluteY
        }
      })
      attestations.pop()

      attestations.forEach(attestation => {
        attestation.lines = []
        doc.pages.forEach(page => {
          if (page.pageInfo.num >= attestation.startPage && page.pageInfo.num <= attestation.endPage) {
            page.content.forEach(content => {
              const absoluteY = Math.round((page.pageInfo.num - 1) * (page.pageInfo.height) + content.y)
              if (content.y > topMargin && content.y < bottomMargin && content.height > textSizeMin && content.height < textSizeMax && content.str.trim().length > 0 && absoluteY >= attestation.absoluteY && absoluteY < attestation.absoluteEndY) {
                const line = {
                  str: content.str,
                  num: Math.round(content.y),
                  size: content.height,
                  x: Math.round(content.x),
                  font: content.fontName,
                  page: page.pageInfo.num
                }
                attestation.lines.push(line)
              }
            })
          }
        })
      })

      const result = JSON.stringify(attestations, null, 2)

      try {
        mkdirSync(dataFile.substring(0, dataFile.lastIndexOf("/")), {recursive: true})
        Logger.log(`Writing index File ${dataFile}`)
        writeFileSync(dataFile, result);
      } catch (err) {
        console.error(err);
      }
    }

    Logger.log("Indexing process complete")
  }

  async generatePDFs(requestId: string, attestationId: string, attestationIds: string[]): Promise<string[]>{

    const files = getAllFiles(ehcPath + "/" + attestationId)

    for (let i = 0; i < files.length; i++) {

      const filename = files[i]

      if(!filename.endsWith("pdf")){
        continue
      }

      const pdfFile = readFileSync(filename).buffer;

      const pdfDoc = await PDFDocument.load(pdfFile, { ignoreEncryption: true })

      const dataFile = filename.replace(ehcPath, dataPath).replace("pdf", "json")

      const data = JSON.parse(readFileSync(dataFile).toString())

      const attestations = []

      attestationIds.forEach(id => {
          attestations.push(findAttestation(id, data))
      })

      attestations.forEach(attestation => {
        if (attestation) {
          const lines = getUniqueLines(attestation)
          lines.forEach(line => {

            pdfDoc.getPages().forEach((page, num) => {

              if (num + 1 === line.page) {

                const {width, height} = page.getSize()

                const y = height - line.num + textSizeOffset

                const startX = getStartPositionForLine(attestation, line.num)

                page.drawLine({
                  start: { x: startX, y: y},
                  end: { x: textLength, y: y}
                })
              }
            })
          })
        }
      })

      const resultFile = filename.replace(ehcPath, requestPath + "/" + requestId)

      mkdirSync(resultFile.substring(0, resultFile.lastIndexOf("/")), {recursive: true})

      writeFileSync(resultFile, await pdfDoc.save())
    }

    const results = getAllFiles(requestPath + "/" + requestId)

    const links = []

    results.forEach(result => {
      links.push(result.replace(requestPath, ""))
    })

    return links;
  }

}