export const WiroModelSort = Object.freeze({
  averagePoint: 'averagepoint',
  commentCount: 'commentcount',
  ratedUserCount: 'ratedusercount',
  relevance: 'relevance',
  time: 'time',
} as const);

export type WiroModelSort = (typeof WiroModelSort)[keyof typeof WiroModelSort];

export const WiroSortOrder = Object.freeze({
  ascending: 'ASC',
  descending: 'DESC',
} as const);

export type WiroSortOrder = (typeof WiroSortOrder)[keyof typeof WiroSortOrder];
