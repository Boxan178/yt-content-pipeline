/**
 * Ejecuta `bootstrap_channel.py` de la skill style-engine para materializar
 * un canal nuevo en disco (`H:/YOUTUBE/<NAME>/branding/`).
 *
 * Reutiliza el venv de `youtube-seo-optimizer` como pide la skill SKILL.md.
 * PYTHONIOENCODING=utf-8 obligatorio en Windows para no romper logs con em-dash.
 *
 * El script es idempotente — si la carpeta ya existe, no falla; solo crea lo
 * que falta y no sobreescribe archivos existentes.
 */

import 'server-only';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { JARVIS_ROOT } from '../config';
import type { ChannelDraft } from './types';

const PYTHON_VENV = path.join(
  JARVIS_ROOT,
  '.claude',
  'skills',
  'youtube-seo-optimizer',
  '.venv',
  'Scripts',
  'python.exe',
);

const BOOTSTRAP_SCRIPT = path.join(
  JARVIS_ROOT,
  '.claude',
  'skills',
  'style-engine',
  'scripts',
  'bootstrap_channel.py',
);

export interface BootstrapExecuteInput {
  draft: ChannelDraft;
  chosenName: string;
  chosenHandle: string;
  chosenDescription: string;
  logoPrompt: string;
  bannerPrompt: string;
}

export interface BootstrapExecuteResult {
  ok: boolean;
  diskPath?: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

export interface BootstrapPreflight {
  ok: boolean;
  missing: string[];
}

/** Verifica que el venv y el script existen ANTES de spawnear. */
export function preflightCheck(): BootstrapPreflight {
  const missing: string[] = [];
  if (!existsSync(PYTHON_VENV)) missing.push(PYTHON_VENV);
  if (!existsSync(BOOTSTRAP_SCRIPT)) missing.push(BOOTSTRAP_SCRIPT);
  return { ok: missing.length === 0, missing };
}

export function executeBootstrap(input: BootstrapExecuteInput): BootstrapExecuteResult {
  const pre = preflightCheck();
  if (!pre.ok) {
    return {
      ok: false,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: `Pre-flight check falló — faltan: ${pre.missing.join(', ')}`,
    };
  }

  const { draft, chosenName, chosenHandle, chosenDescription, logoPrompt, bannerPrompt } = input;
  // Nicho derivado del análisis. Si no está, dejamos string vacío.
  const niche = extractNiche(draft.channelAnalysis ?? '') ?? '';

  const args = [
    BOOTSTRAP_SCRIPT,
    '--name', chosenName,
    '--description', chosenDescription,
    '--handle', chosenHandle,
    '--niche', niche,
    '--language', draft.language,
    '--logo-prompt', logoPrompt,
    '--banner-prompt', bannerPrompt,
    '--visual-profile', draft.visualStyleProfile ?? '',
    '--thumbnail-profile', draft.thumbnailStyleProfile ?? '',
    '--reference-channel', draft.referenceChannelName ?? draft.referenceChannelUrl,
  ];

  const result = spawnSync(PYTHON_VENV, args, {
    cwd: path.join(JARVIS_ROOT, '.claude', 'skills', 'youtube-seo-optimizer'),
    encoding: 'utf-8',
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
    // Timeout 60s — el script es idempotente y no descarga nada.
    timeout: 60_000,
  });

  if (result.error) {
    return {
      ok: false,
      exitCode: result.status ?? null,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error.message,
    };
  }

  const ok = result.status === 0;
  const diskPath = ok ? `H:/YOUTUBE/${chosenName}` : undefined;

  return {
    ok,
    diskPath,
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function extractNiche(channelAnalysis: string): string | null {
  const m = channelAnalysis.match(/^Nicho:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}
