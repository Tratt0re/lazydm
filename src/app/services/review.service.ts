import { Injectable } from '@angular/core';

import { APIChannel } from '@/config/api';
import type { ReviewDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Number of things a review asks to look at (the overview alert shows it). */
export function countReviewItems(review: ReviewDto): number {
  return (
    review.brokenLinkCount +
    review.misplaced.length +
    review.wrongSubtype.length +
    review.untyped.length +
    review.outside.length +
    review.unknownFolders.length +
    review.tooDeep.length
  );
}

/** Where the files of a campaign or system disagree with its sections (the Review page). */
@Injectable({
  providedIn: 'root',
})
export class ReviewService extends BaseIpcService<APIChannel.REVIEW> {
  constructor() {
    super(APIChannel.REVIEW);
  }

  /** `scope`: a campaign slug or `compendium/<system>`. */
  list(scope: string): Promise<ReviewDto> {
    return this.ipcClient.list({ scope });
  }
}
