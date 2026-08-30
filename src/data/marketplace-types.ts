import type { ComponentProps } from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TranslationKey } from '@/src/i18n/translations';

export type Category = { id: string; label: TranslationKey; icon: ComponentProps<typeof MaterialIcons>['name']; description: TranslationKey };
export type PricingType='fixed'|'starting'|'hourly'|'inspection'|'quote';
export type Service = { id:string;
  /**
   * The category this service belongs to.
   *
   * Optional because a service reached through a provider is already scoped by
   * that provider; a service reached from the catalogue is not, and the request
   * form must filter by it or it would offer a selection the backend rejects.
   */
  categoryId?:string;
  /**
   * `services.translation_key`: the stable identity behind the localized name.
   *
   * Null on rows written before keys existed. `name` is the fallback for those
   * and must never be the normal case -- rendering it is what showed Arabic
   * customers "Leak repair".
   */
  translationKey?:string|null; name:string; description?:string; price:number; pricingType:PricingType; transportationFee?:number; emergencySurcharge?:number;  available?:boolean; inspectionRequired?:boolean };
export type Review = { id: string; author: string; rating: number; date: string; comment: string };
export type PublicPortfolioItem = { id:string; title:string; description:string; categoryId?:string; serviceId?:string; completedPeriod?:string; images:string[] };
export type Provider = { id:string; name:string; profession:string; categoryId:string; categoryIds?:string[]; rating:number; reviewCount:number; distance:number|null; price:number; image:string; coverImage:string; verified:boolean; skillCertificateVerified?:boolean; professionalCertificateVerified?:boolean; professionalCertificateCount?:number; available:boolean; bookable?:boolean; emergencyAvailable?:boolean; completedJobs:number; experienceYears:number; experienceSummary?:string; responseTime:string; location:string; serviceRadius:number; languages:string[]; about:string; skills:string[]; certifications:string[]; services:Service[]; portfolio:(PublicPortfolioItem|string)[]; reviews:Review[]; cancellationPolicy:string; guarantee:string; supportedPaymentMethods?:('cash'|'online')[] };
export type ProviderSort = 'recommended' | 'nearest' | 'topRated' | 'lowestPrice';
export type ProviderFilters = { minimumRating: number; minimumPrice: number; maximumPrice: number; maximumDistance: number; availableNow: boolean; verifiedOnly: boolean };
export const defaultProviderFilters: ProviderFilters = { minimumRating: 0, minimumPrice: 0, maximumPrice: 2000, maximumDistance: 50, availableNow: false, verifiedOnly: false };
