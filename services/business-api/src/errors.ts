export class BusinessError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}
export function missing(): never {
  throw new BusinessError(404, "NOT_FOUND", "No se encontró el registro con los datos ingresados");
}
export function conflict(message: string): never {
  throw new BusinessError(409, "CONFLICT", message);
}
