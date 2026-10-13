import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type {
  BrokenLinkDto,
  CopyDocumentPayload,
  CopyDocumentResultDto,
  CopyPlanDto,
  CreateDocumentPayload,
  CreateFromLinkPayload,
  DocumentDto,
  DocumentFileListItemDto,
  DocumentLinksDto,
  LinkTargetDto,
  RenameDocumentPayload,
  RenameDocumentResultDto,
  SaveDocumentCopyPayload,
  UnlinkPayload,
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

  rename(payload: RenameDocumentPayload): Promise<RenameDocumentResultDto> {
    return this.ipcClient.rename(payload);
  }

  links(path: string): Promise<DocumentLinksDto> {
    return this.ipcClient.links({ path });
  }

  /** Files of the note's own scope its links can point to (the editor's link suggestions). */
  async linkTargets(sourcePath: string): Promise<readonly LinkTargetDto[]> {
    const { rows } = await this.ipcClient.linkTargets({ sourcePath });
    return rows;
  }

  unlink(payload: UnlinkPayload): Promise<{ path: string; linkCount: number }> {
    return this.ipcClient.unlink(payload);
  }

  copy(payload: CopyDocumentPayload): Promise<CopyDocumentResultDto> {
    return this.ipcClient.copy(payload);
  }

  copyPlan(path: string, target: string): Promise<CopyPlanDto> {
    return this.ipcClient.copyPlan({ path, target });
  }

  createFromLink(payload: CreateFromLinkPayload): Promise<DocumentDto> {
    return this.ipcClient.createFromLink(payload);
  }

  async listBrokenLinks(campaign: string): Promise<readonly BrokenLinkDto[]> {
    const { rows } = await this.ipcClient.brokenLinks({ campaign });
    return rows;
  }
}
