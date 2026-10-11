import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type {
  CreateDocumentPayload,
  DocumentDto,
  DocumentFileListItemDto,
  SaveDocumentCopyPayload,
  WriteDocumentPayload,
  WriteDocumentResultDto,
} from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

@Injectable({
  providedIn: 'root',
})
export class DocumentService extends BaseIpcService<APIChannel.DOCUMENTS> {
  constructor() {
    super(APIChannel.DOCUMENTS);
  }

  async listFolder(folder: string): Promise<readonly DocumentFileListItemDto[]> {
    const { rows } = await this.ipcClient.list({ folder });
    return rows;
  }

  read(path: string): Promise<DocumentDto> {
    return this.ipcClient.read({ path });
  }

  write(payload: WriteDocumentPayload): Promise<WriteDocumentResultDto> {
    return this.ipcClient.write(payload);
  }

  saveCopy(payload: SaveDocumentCopyPayload): Promise<DocumentDto> {
    return this.ipcClient.saveCopy(payload);
  }

  create(payload: CreateDocumentPayload): Promise<DocumentDto> {
    return this.ipcClient.create(payload);
  }
}
