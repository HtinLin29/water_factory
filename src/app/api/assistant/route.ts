import { NextResponse } from 'next/server';
import { getCityFilterFromRequest } from '@/lib/city-scope';
import { processAssistantQuery } from '@/lib/assistant-engine';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
} from '@/lib/auth-helpers';

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const { cityIds } = getCityFilterFromRequest(request, manager);
  const { query } = await request.json();
  const result = await processAssistantQuery(query ?? '', cityIds);
  return NextResponse.json(result);
}
