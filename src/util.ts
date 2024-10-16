import { readdirSync, statSync } from "fs";
import path from "path";
import {PDFExtract, PDFExtractResult} from "pdf.js-extract";

export function getAllFiles(dirPath, arrayOfFiles?) {
    const files = readdirSync(dirPath)

    arrayOfFiles = arrayOfFiles || []

    files.forEach(function(file) {
        if (statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles)
        } else {
            arrayOfFiles.push(dirPath + "/" + file)
        }
    })

    return arrayOfFiles
}

export function stripLeadingBracketAndTrailingDot(str) :string {
    if(str.startsWith("[")){
        str = str.substring(1, str.length)
    }
    if (str.endsWith(".")) {
        str = str.substring(0, str.length - 1)
    }
    return str
}

export function getUniqueLines(attestation): any[] {
    const lines = new Set<any>()
    attestation.lines.forEach(line => {
        if(isNormalFontSize(line.size)) {
            lines.add(line)
        }
    })
    return Array.from(lines).sort((a, b) => a.num - b.num);
}

export function isNormalFontSize(size){
    return size > 7 && size < 10
}

export function getStartPositionForLine(attestation, num): number{
    const nums = new Set<number>()
    attestation.lines.forEach(line => {
        if(line.num === num && isNormalFontSize(line.size)) {
            nums.add(line.x)
        }
    })
    let results = Array.from(nums);
    return results.sort((a: number, b: number) => a - b)[0];
}

export function findAttestation(id, data){
    if(data.id && data.id === id){
        return data
    }
    if(Array.isArray(data)){
        for(let i = 0; i < data.length; i++){
            if(data[i].id && data[i].id === id){
                return data[i]
            }
            let found
            if(data[i].children){
                found = findAttestation(id, data[i].children)
            }
            if(found){
                return found
            }
        }
    }
}

export async function extractDoc(filename, options): Promise<PDFExtractResult> {
    try {
        return await new PDFExtract().extract(filename, options)
    } catch (err) {
        console.error(err);
    }
}

export function createUniqueId(name: string, ids: any[]) {
    let id
    for (let i = 0; i < 100; i++) {
        id = `${name}-${i}`
        if (!ids.includes(id)) {
            ids.push(id)
            break;
        }
    }
    ids.push()
    return id;
}

export function isNumeric(n): boolean {
    return !isNaN(parseFloat(n)) && isFinite(n);
}