import type { Category, Provider, Service } from '@/src/data/mock-data';
import { getSupabaseClient } from '@/src/lib/supabase';
import type { WarshaDataAdapter } from './types';

type MarketplaceCatalog = {
  categories: Record<string, unknown>[];
  providers: Record<string, unknown>[];
  services: Record<string, unknown>[];
};

function mapCategory(row:Record<string,unknown>):Category{return{id:String(row.id),label:String(row.translation_key) as Category['label'],icon:String(row.icon_name) as Category['icon'],description:String(row.description_key) as Category['description']}}
function mapService(row:Record<string,unknown>):Service{return{id:String(row.id),name:String(row.name),price:Number(row.price_egp),pricingType:String(row.pricing_type) as Service['pricingType'],duration:String(row.duration_label??'')}}
function mapLinkedService(link:Record<string,unknown>):Service{const service=mapService(link.service as Record<string,unknown>);return{...service,price:Number(link.custom_price_egp??service.price),pricingType:String(link.pricing_type??service.pricingType) as Service['pricingType'],transportationFee:Number(link.transportation_fee_egp??0),emergencySurcharge:Number(link.emergency_surcharge_egp??0),available:link.is_active!==false}}
function mapProvider(row:Record<string,unknown>):Provider{const services=(row.provider_services as Record<string,unknown>[]??[]).map(mapLinkedService);return{id:String(row.id),name:String(row.display_name),profession:String(row.profession_key) as Provider['profession'],categoryId:String(row.primary_category_id),rating:Number(row.rating_average),reviewCount:Number(row.review_count),distance:0,price:Number(row.starting_price_egp),image:String(row.avatar_url??''),coverImage:String(row.cover_image_url??''),verified:Boolean(row.is_verified),skillCertificateVerified:Boolean(row.skill_certificate_verified),available:Boolean(row.is_available),bookable:Boolean(row.bookable),emergencyAvailable:Boolean(row.emergency_available),completedJobs:Number(row.completed_jobs),experienceYears:Number(row.experience_years),responseTime:String(row.response_time_label??''),location:String(row.location_label??''),serviceRadius:Number(row.service_radius_km),languages:Array.isArray(row.languages)?row.languages.map(String):[],about:String(row.about??''),skills:Array.isArray(row.skills)?row.skills.map(String):[],certifications:[],services,portfolio:[],reviews:[],cancellationPolicy:String(row.cancellation_policy??''),guarantee:String(row.guarantee_text??'')}}

let activeCatalogRequest: Promise<MarketplaceCatalog> | null = null;
function marketplaceCatalog() {
  if (activeCatalogRequest) return activeCatalogRequest;
  activeCatalogRequest = (async () => {
    const { data, error } = await getSupabaseClient().rpc(
      'get_marketplace_catalog',
    );
    if (error) throw error;
    const catalog = (data ?? {}) as Partial<MarketplaceCatalog>;
    return {
      categories: Array.isArray(catalog.categories) ? catalog.categories : [],
      providers: Array.isArray(catalog.providers) ? catalog.providers : [],
      services: Array.isArray(catalog.services) ? catalog.services : [],
    };
  })().finally(() => {
    activeCatalogRequest = null;
  });
  return activeCatalogRequest;
}

export const supabaseDataAdapter:WarshaDataAdapter={
  mode:'supabase',
  async listCategories(){
    return (await marketplaceCatalog()).categories.map(mapCategory);
  },
  async listProviders(){
    return (await marketplaceCatalog()).providers.map(mapProvider);
  },
  async getProvider(id){
    const row=(await marketplaceCatalog()).providers.find(item=>String(item.id)===id);
    return row?mapProvider(row):undefined;
  },
  async listServices(categoryId){
    const rows=(await marketplaceCatalog()).services;
    return rows
      .filter(row=>!categoryId||String(row.category_id)===categoryId)
      .map(mapService);
  },
};
