import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAuthenticatedManager,
  unauthorizedResponse,
  badRequestResponse,
} from '@/lib/auth-helpers';

const BUCKET = 'driver-licenses';

async function uploadLicenseFile(
  admin: ReturnType<typeof createAdminClient>,
  driverId: string,
  file: File,
  side: 'front' | 'back'
): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const allowed = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  if (!allowed.includes(ext)) {
    throw new Error(`Invalid file type for license ${side}. Use JPG, PNG, WEBP, or PDF.`);
  }

  const path = `${driverId}/license-${side}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  });

  if (error) throw new Error(error.message);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

import { writeCityFromBody } from '@/lib/city-scope';

export async function POST(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const name = (formData.get('name') as string)?.trim();
    const phone = (formData.get('phone') as string)?.trim() || null;
    const salaryRaw = formData.get('salary') as string;
    const salary = salaryRaw ? parseFloat(salaryRaw) : null;
    const licenseFront = formData.get('licenseFront') as File | null;
    const licenseBack = formData.get('licenseBack') as File | null;
    const cityIdRaw = formData.get('cityId') as string | null;

    if (!name) return badRequestResponse('Driver name is required');

    let cityId: string;
    try {
      cityId = writeCityFromBody(manager, cityIdRaw ?? new URL(request.url).searchParams.get('cityId'));
    } catch (e) {
      return badRequestResponse(e instanceof Error ? e.message : 'City required');
    }

    const admin = createAdminClient();

    const { data: driver, error: dbError } = await admin
      .from('drivers')
      .insert({
        name,
        phone,
        salary: salary != null && !isNaN(salary) ? salary : null,
        created_by: manager.id,
        city_id: cityId,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    try {
      const [frontUrl, backUrl] = await Promise.all([
        licenseFront && licenseFront.size > 0
          ? uploadLicenseFile(admin, driver.id, licenseFront, 'front')
          : null,
        licenseBack && licenseBack.size > 0
          ? uploadLicenseFile(admin, driver.id, licenseBack, 'back')
          : null,
      ]);

      if (frontUrl || backUrl) {
        await admin
          .from('drivers')
          .update({
            license_front_url: frontUrl,
            license_back_url: backUrl,
          })
          .eq('id', driver.id);
      }

      const { data: updated } = await admin
        .from('drivers')
        .select('*')
        .eq('id', driver.id)
        .single();

      return NextResponse.json({ driver: updated });
    } catch (uploadError) {
      await admin.from('drivers').delete().eq('id', driver.id);
      return badRequestResponse(
        uploadError instanceof Error ? uploadError.message : 'Upload failed'
      );
    }
  }

  return badRequestResponse('Use multipart form for driver creation');
}

export async function PATCH(request: Request) {
  const { manager, error } = await getAuthenticatedManager();
  if (!manager) return unauthorizedResponse(error ?? undefined);

  const contentType = request.headers.get('content-type') ?? '';

  if (!contentType.includes('multipart/form-data')) {
    return badRequestResponse('Use multipart form for driver updates');
  }

  const formData = await request.formData();
  const driverId = formData.get('driverId') as string;
  if (!driverId) return badRequestResponse('Driver ID required');

  const name = (formData.get('name') as string)?.trim();
  const phone = (formData.get('phone') as string)?.trim() || null;
  const salaryRaw = formData.get('salary') as string;
  const salary = salaryRaw ? parseFloat(salaryRaw) : null;
  const licenseFront = formData.get('licenseFront') as File | null;
  const licenseBack = formData.get('licenseBack') as File | null;

  if (!name) return badRequestResponse('Driver name is required');

  const admin = createAdminClient();

  const updates: Record<string, unknown> = {
    name,
    phone,
    salary: salary != null && !isNaN(salary) ? salary : null,
  };

  try {
    if (licenseFront && licenseFront.size > 0) {
      updates.license_front_url = await uploadLicenseFile(
        admin,
        driverId,
        licenseFront,
        'front'
      );
    }
    if (licenseBack && licenseBack.size > 0) {
      updates.license_back_url = await uploadLicenseFile(
        admin,
        driverId,
        licenseBack,
        'back'
      );
    }
  } catch (uploadError) {
    return badRequestResponse(
      uploadError instanceof Error ? uploadError.message : 'Upload failed'
    );
  }

  const { data, error: dbError } = await admin
    .from('drivers')
    .update(updates)
    .eq('id', driverId)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ driver: data });
}
