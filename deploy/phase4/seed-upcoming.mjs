import { createPrismaClient } from '@aeroquetzal/database';
import { BusinessService } from './services/business-api/dist/service.js';

const db = createPrismaClient();
const service = new BusinessService(db);
const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const base = new Date(today + 'T00:00:00-06:00');
let created = 0, existing = 0;
try {
 for (let day=1;day<=14;day++) {
  for (const [number, registration, hour] of [['AQ101','TG-AQ02',7],['AQ205','TG-AQ01',10],['AQ310','TG-AQ02',14],['AQ118','TG-AQ01',17]]) {
   const flight = await db.flight.findUniqueOrThrow({where:{flightNumber:number}});
   const aircraft = await db.aircraft.findUniqueOrThrow({where:{registration}});
   const departureAt = new Date(base.getTime()+day*86400000+hour*3600000);
   if (await db.flightInstance.findUnique({where:{flightId_departureAt:{flightId:flight.id,departureAt}}})) {existing++;continue;}
   await service.createInstance('phase4-schedule',{flightId:flight.id,aircraftId:aircraft.id,departureAt:departureAt.toISOString(),arrivalAt:new Date(departureAt.getTime()+flight.durationMinutes*60000).toISOString(),capacity:aircraft.capacity});
   created++;
  }
 }
 console.log(JSON.stringify({created,existing,dates:'Próximos 14 días, hora de Guatemala',preserved:'No se modificaron reservas ni salidas previas'}));
} finally {await db.$disconnect();}
