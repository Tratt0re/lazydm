import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { APIChannel } from '@/config/api';
import type { ReviewDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';

/** Number of things a review asks to look at (the overview alert shows it). */
export function countReviewItems(review: ReviewDto): number {
  return (
    review.brokenLinkCount +
    review.outside.length +
    review.unknownFolders.length +
    review.tooDeep.length +
    review.copies.length
  );
}

/** Where the files of a campaign or system disagree with its sections (the Review page). */
@Injectable({
  providedIn: 'root',
})
export class ReviewService extends BaseIpcService<APIChannel.REVIEW> {
  private readonly translateService = inject(TranslateService);

  constructor() {
    super(APIChannel.REVIEW);
  }

  /** What is wrong, in plain words: "2 broken links, 1 note outside any section". */
  describe(review: ReviewDto): string {
    const parts: [string, number][] = [
      ['broken', review.brokenLinkCount],
      ['outside', review.outside.length],
      ['unknown', review.unknownFolders.length],
      ['deep', review.tooDeep.length],
      ['copies', review.copies.length],
    ];
    return parts
      .filter(([, count]) => count > 0)
      .map(([key, count]) =>
        this.translateService.instant(`review.summary.${key}_${count === 1 ? 'one' : 'other'}`, {
          count,
        }),
      )
      .join(', ');
  }

  /** `scope`: a campaign slug or `compendium/<system>`. */
  list(scope: string): Promise<ReviewDto> {
    return this.ipcClient.list({ scope });
  }
}
