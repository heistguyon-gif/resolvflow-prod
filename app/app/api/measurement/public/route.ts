import { publicMeasurement } from "../../../../lib/measurement/http";
import { measurementRuntime } from "../../../../lib/measurement/runtime";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return publicMeasurement(request, measurementRuntime());
}
export const POST = GET;
