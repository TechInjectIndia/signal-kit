import { records } from '../../../lib/server/records.js';
export function GET() {
  return Response.json(records);
}
