import type { Address,Booking,NewBooking } from '@/src/bookings/booking-types';
import type { Category,Provider,Service } from '@/src/data/marketplace-types';
export interface MarketplaceRepository{listCategories():Promise<Category[]>;listProviders():Promise<Provider[]>;getProvider(id:string):Promise<Provider|undefined>;listServices(categoryId?:string):Promise<Service[]>}
export interface FavouriteRepository{list():Promise<string[]>;add(providerId:string):Promise<void>;remove(providerId:string):Promise<void>}
export interface AddressRepository{list():Promise<Address[]>;add(input:Omit<Address,'id'>):Promise<Address>;update(id:string,input:Omit<Address,'id'>):Promise<Address>;remove(id:string):Promise<void>;setDefault(id:string):Promise<void>}
export interface BookingRepository{list():Promise<Booking[]>;create(input:NewBooking):Promise<Booking>;cancel(id:string,reason:string):Promise<Booking>;reschedule(id:string,date:string,time:string):Promise<Booking>}
export type CustomerProfile={id:string;displayName:string;preferredLanguage:'en'|'ar';phone:string};
export interface CustomerProfileRepository{get():Promise<CustomerProfile>;update(input:Pick<CustomerProfile,'displayName'|'preferredLanguage'>):Promise<CustomerProfile>}
