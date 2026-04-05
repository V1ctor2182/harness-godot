import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 does not catch rejected promises from async route handlers.
// This wrapper ensures async errors reach the error-handling middleware.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
