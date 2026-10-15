import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type {
  BrokenLinkDto,
  CopyDocumentPayload,
  CopyDocumentResultDto,
  CopyPlanDto,
  CreateDocumentPayload,
  CreateFromLinkPayload,
  DeleteFilePayload,
  DeleteFolderMode,
  DeleteFolderResultDto,
  DocumentDto,
  DocumentFileListItemDto,
  DocumentFolderDto,
  DocumentLinksDto,
  LinkTargetDto,
  MoveDocumentResultDto,
  RenameAssetPayload,
  RenameDocumentPayload,
  RenameDocumentResultDto,
  RenameFolderResultDto,
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

  /** Files directly in a folder and its sub-folders (a section's sub-types), for the section page. */
  async listFolderEntries(folder: string): Promise<{
    files: readonly DocumentFileListItemDto[];
    folders: readonly DocumentFolderDto[];
  }> {
    const { rows, folders } = await this.ipcClient.list({ folder, direct: true });
    return { files: rows, folders };
  }

  /**
   * A section as a tree: the files directly in it, and its sub-folders (from the disk, so empty ones too) each
   * with its files. Deeper files are left out (one level of sub-folders).
   */
  async listSectionTree(folder: string): Promise<{
    files: readonly DocumentFileListItemDto[];
    folders: readonly (DocumentFolderDto & { files: readonly DocumentFileListItemDto[] })[];
  }> {
    const { rows, folders } = await this.ipcClient.list({ folder });
    const prefix = `${folder.replace(/\/+$/, '')}/`;
    const depthOf = (file: DocumentFileListItemDto) => file.path.slice(prefix.length).split('/').length;
    return {
      files: rows.filter((file) => depthOf(file) === 1),
      folders: folders.map((item) => ({
        ...item,
        files: rows.filter(
          (file) => file.path.startsWith(`${prefix}${item.name}/`) && depthOf(file) === 2,
        ),
      })),
    };
  }

  /** Shows a vault file or folder in Finder / Explorer / the file manager. */
  async reveal(path: string): Promise<void> {
    await this.ipcClient.reveal({ path });
  }

  /** New sub-folder of a section (`name` is turned into the folder slug); returns its slug. */
  async createFolder(folder: string, name: string): Promise<string> {
    return (await this.ipcClient.createFolder({ folder, name })).name;
  }

  /** Sets a note's `type` and `subtype` (null removes it) in its frontmatter. */
  async setType(path: string, type: string, subtype: string | null): Promise<void> {
    await this.ipcClient.setType({ path, type, subtype });
  }

  /** Moves a note into a section folder of its scope; the links resolving to it follow. */
  move(path: string, folder: string): Promise<MoveDocumentResultDto> {
    return this.ipcClient.move({ path, folder });
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

  /** Renames an asset (the extension stays) and, by default, the links and embeds pointing to it. */
  renameAsset(payload: RenameAssetPayload): Promise<RenameDocumentResultDto> {
    return this.ipcClient.renameAsset(payload);
  }

  /** Moves a note or an asset to the system Trash, by default rewriting the links pointing to it first. */
  deleteFile(payload: DeleteFilePayload): Promise<RenameDocumentResultDto> {
    return this.ipcClient.delete(payload);
  }

  /** Renames a sub-folder of a section: the folder, its notes' sub-type and the path links through it. */
  renameFolder(folder: string, name: string): Promise<RenameFolderResultDto> {
    return this.ipcClient.renameFolder({ folder, name });
  }

  /** Deletes a sub-folder (to the system Trash), its files with it or moved to the main folder first. */
  deleteFolder(
    folder: string,
    mode: DeleteFolderMode,
    rewriteLinks: boolean,
  ): Promise<DeleteFolderResultDto> {
    return this.ipcClient.deleteFolder({ folder, mode, rewriteLinks });
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
