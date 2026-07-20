import type { Address,Booking,BookingStatus,NewBooking } from '@/src/bookings/booking-types';
import type { Category,Provider,Service } from '@/src/data/marketplace-types';
export interface MarketplaceRepository{listCategories():Promise<Category[]>;listProviders():Promise<Provider[]>;getProvider(id:string):Promise<Provider|undefined>;listServices(categoryId?:string):Promise<Service[]>}
export interface FavouriteRepository{list():Promise<string[]>;add(providerId:string):Promise<void>;remove(providerId:string):Promise<void>}
export interface AddressRepository{list():Promise<Address[]>;add(input:Omit<Address,'id'>):Promise<Address>;remove(id:string):Promise<void>}
export interface BookingRepository{list():Promise<Booking[]>;create(input:NewBooking):Promise<Booking>;cancel(id:string):Promise<Booking>;history(id:string):Promise<Booking['history']>;updateStatus(id:string,status:BookingStatus):Promise<Booking>}
