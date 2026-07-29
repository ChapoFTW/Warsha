export type ReviewAttachment={id:string;url:string;mimeType?:string;size?:number};
export type ProviderReply={id:string;body:string;createdAt:string};
export type BookingReview={id:string;bookingId:string;providerId:string;reviewerName:string;rating:number;comment:string;createdAt:string;attachments:ReviewAttachment[];reply?:ProviderReply};
export type RatingSummary={average:number;count:number;distribution:Record<1|2|3|4|5,number>;reviews:BookingReview[]};
export type ReviewInput={bookingId:string;providerId:string;rating:number;comment:string;attachments:ReviewAttachment[]};
