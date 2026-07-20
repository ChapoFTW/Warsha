import type { ComponentProps } from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TranslationKey } from '@/src/i18n/translations';

export type Availability = { availableNow: boolean; schedule: string[] };
export type Category = { id: string; label: TranslationKey; icon: ComponentProps<typeof MaterialIcons>['name']; description: TranslationKey };
export type Service = { id:string; name:string; description?:string; price:number; pricingType:'fixed'|'starting'|'inspection'; duration:string; available?:boolean; inspectionRequired?:boolean };
export type Review = { id: string; author: string; rating: number; date: string; comment: string };
export type Provider = { id:string; name:string; profession:TranslationKey; categoryId:string; rating:number; reviewCount:number; distance:number; price:number; image:string; coverImage:string; verified:boolean; available:boolean; emergencyAvailable?:boolean; availability?:Availability; completedJobs:number; experienceYears:number; responseTime:string; location:string; serviceRadius:number; languages:string[]; about:string; skills:string[]; certifications:string[]; services:Service[]; portfolio:string[]; reviews:Review[]; cancellationPolicy:string; guarantee:string };
export type ProviderSort = 'recommended' | 'nearest' | 'topRated' | 'lowestPrice';
export type ProviderFilters = { minimumRating: number; minimumPrice: number; maximumPrice: number; maximumDistance: number; availableNow: boolean; verifiedOnly: boolean };
export const defaultProviderFilters: ProviderFilters = { minimumRating: 0, minimumPrice: 0, maximumPrice: 2000, maximumDistance: 50, availableNow: false, verifiedOnly: false };
