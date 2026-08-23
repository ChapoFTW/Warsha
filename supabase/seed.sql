insert into public.service_categories(id,translation_key,description_key,icon_name,sort_order,demand_rank) values
('plumbing','plumbing','plumbingDescription','plumbing',10,1),('electrical','electrical','electricalDescription','electrical-services',20,2),('carpentry','carpentry','carpentryDescription','handyman',30,6),('ac','acRepair','acDescription','ac-unit',40,3),('cleaning','cleaning','cleaningDescription','cleaning-services',50,4),('painting','painting','paintingDescription','format-paint',60,7),('appliance-repair','applianceRepair','applianceRepairDescription','kitchen',70,5),('satellite-tv-installation','satelliteTv','satelliteTvDescription','satellite-alt',80,12),('moving-help','movingHelp','movingHelpDescription','local-shipping',90,9),('general-maintenance','generalMaintenance','generalMaintenanceDescription','home-repair-service',100,8),
('barber','barber','barberDescription','content-cut',110,10),('hairdressing','hairdressing','hairdressingDescription','face-retouching-natural',120,11),('personal-styling','personalStyling','personalStylingDescription','checkroom',130,13)
on conflict(id) do update set translation_key=excluded.translation_key,description_key=excluded.description_key,icon_name=excluded.icon_name,sort_order=excluded.sort_order,demand_rank=excluded.demand_rank;

insert into public.services(id,category_id,name,pricing_type,price_egp,duration_label) values
('10000000-0000-4000-8000-000000000001','plumbing','Home inspection','inspection',180,'30–45 min'),('10000000-0000-4000-8000-000000000002','plumbing','Leak repair','starting',320,'1–2 hours'),('10000000-0000-4000-8000-000000000003','electrical','Electrical inspection','inspection',220,'45 min'),('10000000-0000-4000-8000-000000000004','cleaning','Deep cleaning','starting',650,'4–6 hours'),('10000000-0000-4000-8000-000000000005','ac','AC cleaning','fixed',275,'1 hour')
on conflict(id) do update set name=excluded.name,pricing_type=excluded.pricing_type,price_egp=excluded.price_egp,duration_label=excluded.duration_label;

with provider_seed as (
  select n,((substr(md5('warsha-provider-'||n),1,8)||'-'||substr(md5('warsha-provider-'||n),9,4)||'-4'||substr(md5('warsha-provider-'||n),14,3)||'-8'||substr(md5('warsha-provider-'||n),18,3)||'-'||substr(md5('warsha-provider-'||n),21,12))::uuid) id
  from generate_series(1,20) n
)
insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,about,experience_years,rating_average,review_count,completed_jobs,starting_price_egp,response_time_label,location_label,service_radius_km,languages,skills,is_verified,is_available,is_published,onboarding_status,cancellation_policy,guarantee_text)
select id,null,(array['Ahmed Hassan','Mahmoud Adel','Omar Tarek','Youssef Samir','Mostafa Nabil','Karim Fathy','Hany Ashraf','Amr Khaled','Ali Wael','Ehab Sameh','Mohamed Reda','Tamer Salah','Sherif Emad','Khaled Magdy','Ibrahim Saber','Nader Gamal','Ramy Hossam','Sayed Maged','Adel Hamdy','Fady Nasser'])[n],(array['plumbing','electrical','carpentry','ac','cleaning','painting'])[((n-1)%6)+1],(array['plumbing','electrical','carpentry','acRepair','cleaning','painting'])[((n-1)%6)+1],'Fictional Warsha professional serving homes with clear pricing and dependable appointments.',3+(n%12),round((4.0+(n%10)::numeric/10),1),18+n*7,40+n*11,180+n*20,case when n%2=0 then 'Usually replies in 10 minutes' else 'Usually replies in 25 minutes' end,(array['Cairo','Giza','Alexandria'])[((n-1)%3)+1],8+(n%12),array['Arabic','English'],array['Home service','Maintenance'],n%3<>0,n%4<>0,true,'approved','Free cancellation before provider acceptance.','Warsha service support terms apply.'
from provider_seed on conflict(id) do update set display_name=excluded.display_name,is_published=true,onboarding_status='approved',location_label=excluded.location_label,rating_average=excluded.rating_average;

with provider_seed as (select n,((substr(md5('warsha-provider-'||n),1,8)||'-'||substr(md5('warsha-provider-'||n),9,4)||'-4'||substr(md5('warsha-provider-'||n),14,3)||'-8'||substr(md5('warsha-provider-'||n),18,3)||'-'||substr(md5('warsha-provider-'||n),21,12))::uuid) id from generate_series(1,20) n)
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,transportation_fee_egp,emergency_surcharge_egp)
select p.id,s.id,s.price_egp+(p.n*5),s.pricing_type,75,250 from provider_seed p join lateral(select id,price_egp,pricing_type from public.services order by id limit 1 offset ((p.n-1)%5)) s on true
on conflict(provider_id,service_id) do update set custom_price_egp=excluded.custom_price_egp,pricing_type=excluded.pricing_type,transportation_fee_egp=excluded.transportation_fee_egp,emergency_surcharge_egp=excluded.emergency_surcharge_egp,is_active=true;

with provider_seed as (select n,((substr(md5('warsha-provider-'||n),1,8)||'-'||substr(md5('warsha-provider-'||n),9,4)||'-4'||substr(md5('warsha-provider-'||n),14,3)||'-8'||substr(md5('warsha-provider-'||n),18,3)||'-'||substr(md5('warsha-provider-'||n),21,12))::uuid) id from generate_series(1,20) n)
insert into public.provider_availability(provider_id,weekday,start_time,end_time)
select id,d,'09:00','18:00' from provider_seed cross join generate_series(0,5) d
on conflict(provider_id,weekday,start_time,end_time) where available_date is null do nothing;

with provider_seed as (select n,((substr(md5('warsha-provider-'||n),1,8)||'-'||substr(md5('warsha-provider-'||n),9,4)||'-4'||substr(md5('warsha-provider-'||n),14,3)||'-8'||substr(md5('warsha-provider-'||n),18,3)||'-'||substr(md5('warsha-provider-'||n),21,12))::uuid) id from generate_series(1,20) n)
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
select id,(array['Cairo','Giza','Alexandria'])[((n-1)%3)+1],(array['Nasr City','Dokki','Smouha'])[((n-1)%3)+1],8+(n%12) from provider_seed
on conflict do nothing;
