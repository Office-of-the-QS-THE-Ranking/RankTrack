import type * as Review from "@/app/actions/review";
import { runtime } from "./index";

export const addReviewTerm = (...a: Parameters<typeof Review.addReviewTerm>) => runtime().review.addReviewTerm(...a);
export const decideFinding = (...a: Parameters<typeof Review.decideFinding>) => runtime().review.decideFinding(...a);
export const forgetReading = (...a: Parameters<typeof Review.forgetReading>) => runtime().review.forgetReading(...a);
export const openReview = (...a: Parameters<typeof Review.openReview>) => runtime().review.openReview(...a);
export const removeReviewTerm = (...a: Parameters<typeof Review.removeReviewTerm>) => runtime().review.removeReviewTerm(...a);
export const reviewTerms = (...a: Parameters<typeof Review.reviewTerms>) => runtime().review.reviewTerms(...a);
export const sendPages = (...a: Parameters<typeof Review.sendPages>) => runtime().review.sendPages(...a);
export const startReading = (...a: Parameters<typeof Review.startReading>) => runtime().review.startReading(...a);
