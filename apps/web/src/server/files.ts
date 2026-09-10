import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { validateUpload } from '@operis/domain';

export async function readUpload(form: FormData, kind: 'spreadsheet' | 'document' | 'avatar') {
  const file = form.get('file');
  if (!(file instanceof File)) throw new Error('Selecione um arquivo.');
  const extension = validateUpload(file.name, file.type, file.size, kind);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (extension === 'pdf' && bytes.subarray(0, 5).toString() !== '%PDF-')
    throw new Error('O conteúdo não corresponde a um PDF.');
  if (extension === 'png' && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error('O conteúdo não corresponde a uma imagem PNG.');
  if (['jpg', 'jpeg'].includes(extension) && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))
    throw new Error('O conteúdo não corresponde a uma imagem JPEG.');
  if (extension === 'xlsx' && !(bytes[0] === 80 && bytes[1] === 75))
    throw new Error('O conteúdo não corresponde a uma planilha XLSX.');
  if (extension === 'csv' && (bytes.includes(0) || (bytes[0] === 77 && bytes[1] === 90)))
    throw new Error('O CSV contém conteúdo binário inválido.');
  const name = file.name.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 180);
  const mime = (
    {
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
    } as Record<string, string>
  )[extension]!;
  return {
    bytes,
    name,
    mime,
    size: bytes.length,
    extension,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  };
}
