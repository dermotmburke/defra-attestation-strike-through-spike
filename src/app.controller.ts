import {Body, Controller, Get, Param, Post, Render} from '@nestjs/common';
import {AppService} from './app.service';
import {readdirSync, readFileSync} from 'fs';
import {v4 as uuidv4} from 'uuid';
import { Logger } from '@nestjs/common';
import {isNumeric} from "./util";

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {
    }

    @Get('index')
    async indexPdfs() {
        await this.appService.indexPdfs()
        return "Indexing complete!!"
    }

    @Get()
    @Render('index')
    root() {
        const links = readdirSync(`${process.cwd()}/data`)
        return {links: links.filter(link => isNumeric(link))};
    }

    @Get(':id')
    @Render('select-attestations')
    showAttestations(@Param() params: any) {
        if(params.id && isNumeric(params.id)){
            const data = JSON.parse(readFileSync(`${process.cwd()}/data/${params.id}/en/${params.id}.json`).toString())
            return {data: data, id: params.id};
        }
    }

    @Post()
    @Render('results')
    async post(@Body() ids: any) {
        const uid = uuidv4();
        const attestationIds = Object.keys(ids).filter(id => id.startsWith("II."));
        const attestationId = ids.attestationId;
        Logger.log(`Selected attestation: ${attestationId}, ids: ${attestationIds}`)
        return {links: await this.appService.generatePDFs(uid, attestationId, attestationIds)};
    }
}
