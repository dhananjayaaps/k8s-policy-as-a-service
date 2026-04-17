import { NextRequest, NextResponse } from 'next/server';
import { promisify } from 'util';
import { gunzip } from 'zlib';

const gunzipAsync = promisify(gunzip);

/**
 * Converts a GitHub tree/blob URL to a raw.githubusercontent.com base path.
 *
 * Input:  https://github.com/bitnami/charts/tree/main/bitnami/nginx
 * Output: https://raw.githubusercontent.com/bitnami/charts/main/bitnami/nginx
 */
function githubToRaw(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('github.com')) return null;
    // Remove /tree/ or /blob/ segment
    const parts = u.pathname.replace(/^\//, '').split('/');
    // parts: [owner, repo, 'tree'|'blob', branch, ...rest]
    if (parts.length < 4) return null;
    const [owner, repo, , branch, ...rest] = parts;
    const path = rest.join('/');
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { accept: 'text/plain, */*' } });
    if (!r.ok) return null;
    const text = await r.text();
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/helm-values?packageId=xxx&version=yyy&repo=yyy&name=zzz
 *
 * Returns JSON: { values: string, chartYaml: string }
 *
 * Strategy order:
 *  1. Package-detail JSON → extract source GitHub link → fetch raw values.yaml + Chart.yaml
 *  2. ArtifactHub binary values endpoint (gzip-compressed) + metadata from detail
 *  3. default_values string field from package-detail JSON
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const packageId = searchParams.get('packageId');
  const version = searchParams.get('version');
  const repo = searchParams.get('repo');
  const name = searchParams.get('name');

  let detailJson: Record<string, unknown> | null = null;

  // Fetch package detail once — used in multiple strategies
  if (repo && name) {
    try {
      const r = await fetch(
        `https://artifacthub.io/api/v1/packages/helm/${repo}/${name}`,
        { headers: { accept: 'application/json' } },
      );
      if (r.ok) detailJson = await r.json();
    } catch {
      // ignore
    }
  }

  // ── Strategy 1: GitHub raw (best quality, proper YAML with comments) ──────
  if (detailJson) {
    const links = (detailJson.links ?? []) as Array<{ name: string; url: string }>;
    const sourceLink = links.find((l) => l.name === 'source' && l.url?.includes('github.com'));

    if (sourceLink) {
      const rawBase = githubToRaw(sourceLink.url);
      if (rawBase) {
        const [values, chartYaml] = await Promise.all([
          fetchText(`${rawBase}/values.yaml`),
          fetchText(`${rawBase}/Chart.yaml`),
        ]);

        if (values) {
          return NextResponse.json({ values, chartYaml: chartYaml ?? null });
        }
      }
    }
  }

  // ── Strategy 2: ArtifactHub binary values endpoint (gzip) ─────────────────
  if (packageId && version) {
    try {
      const r = await fetch(
        `https://artifacthub.io/api/v1/packages/${packageId}/${version}/values`,
        { headers: { accept: 'application/octet-stream, application/gzip, */*' } },
      );
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        let text: string;
        if (buf[0] === 0x1f && buf[1] === 0x8b) {
          const decompressed = await gunzipAsync(buf);
          text = decompressed.toString('utf-8');
        } else {
          text = buf.toString('utf-8');
        }
        if (text.trim()) {
          return NextResponse.json({ values: text, chartYaml: null });
        }
      }
    } catch {
      // fall through
    }
  }

  // ── Strategy 3: default_values field from package detail JSON ─────────────
  if (detailJson) {
    const dv = detailJson.default_values;
    if (typeof dv === 'string' && dv.trim()) {
      return NextResponse.json({ values: dv, chartYaml: null });
    }
  }

  return NextResponse.json({ error: 'Could not fetch values from any source' }, { status: 502 });
}
