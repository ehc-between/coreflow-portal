import { Pipe, PipeTransform, SecurityContext, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';

/**
 * Render (AI-generated) markdown as sanitized HTML for `[innerHTML]`:
 * GitHub-flavoured, single newlines become line breaks, and Angular's HTML
 * sanitizer strips anything unsafe. Pure, so a streaming text re-renders only
 * when it actually changes.
 */
@Pipe({ name: 'appMarkdown' })
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(text: string | null | undefined): string {
    if (!text) {
      return '';
    }
    const html = marked.parse(text, { async: false, gfm: true, breaks: true });
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
  }
}
