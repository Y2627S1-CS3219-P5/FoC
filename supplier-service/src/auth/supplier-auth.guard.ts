/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added bearer authentication, verified-principal attachment, and
 * role-aware NestJS route protection for issue #16.
 * Author review: Required before merge.
 */
import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  SESSION_VERIFIER,
  SessionVerifier,
  UnauthenticatedSessionError,
  UserRole,
  VerifiedPrincipal,
} from "./session-verifier";

const REQUIRED_ROLES = Symbol("REQUIRED_ROLES");
const BEARER_HEADER_PATTERN = /^Bearer [^\s]+$/;

interface SupplierHttpRequest {
  headers: {
    authorization?: string | string[];
  };
}

export interface AuthenticatedSupplierRequest extends SupplierHttpRequest {
  principal: VerifiedPrincipal;
}

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({
    code: "UNAUTHENTICATED",
    message: "A valid bearer token is required.",
  });
}

function verificationUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: "AUTHENTICATION_UNAVAILABLE",
    message: "Authentication is temporarily unavailable.",
  });
}

@Injectable()
export class SupplierAuthGuard implements CanActivate {
  constructor(
    @Inject(SESSION_VERIFIER)
    private readonly verifier: SessionVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SupplierHttpRequest>();
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== "string" ||
      !BEARER_HEADER_PATTERN.test(authorization)
    ) {
      throw unauthenticated();
    }

    let principal: VerifiedPrincipal;
    try {
      principal = await this.verifier.verify(authorization);
    } catch (error) {
      if (error instanceof UnauthenticatedSessionError) {
        throw unauthenticated();
      }
      throw verificationUnavailable();
    }

    (request as AuthenticatedSupplierRequest).principal = principal;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles?.length && !requiredRoles.includes(principal.role)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
      });
    }

    return true;
  }
}

export function RequireAuthentication(...roles: UserRole[]) {
  return applyDecorators(
    SetMetadata(REQUIRED_ROLES, roles),
    UseGuards(SupplierAuthGuard),
  );
}
