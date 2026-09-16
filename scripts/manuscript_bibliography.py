"""Read the manuscript bibliography and prepare website citation records.

Run from any directory after updating the manuscript source. This writes only the
included-study BibTeX download and an ignored cache for the website data update.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

WEBSITE_ROOT = Path(__file__).resolve().parents[1]
MANUSCRIPT_ROOT = WEBSITE_ROOT.parent
KEY_MIGRATIONS = {
    'perdomo2019classification': 'a610a9d426b3',
    'subramanian2022classification': '925beb945b38',
    'schlegl2018fluid': 'cfc9b29316ca',
    'Kumar2023_Bioengineering_Corpus': 'ad6ea1627565',
}


def _escaped(text: str, position: int) -> bool:
    preceding = 0
    while position > 0 and text[position - 1] == '\\':
        preceding += 1
        position -= 1
    return bool(preceding % 2)


def _skip_space(text: str, position: int) -> int:
    while position < len(text):
        if text[position].isspace() or text[position] == ',':
            position += 1
        elif text[position] == '%' and not _escaped(text, position):
            newline = text.find('\n', position)
            position = len(text) if newline < 0 else newline + 1
        else:
            break
    return position


def _group(text: str, position: int) -> tuple[str, int]:
    """Return a braced/quoted value, preserving its interior TeX syntax."""
    opener = text[position]
    if opener == '{':
        depth, cursor = 1, position + 1
        while cursor < len(text):
            if not _escaped(text, cursor):
                if text[cursor] == '{':
                    depth += 1
                elif text[cursor] == '}':
                    depth -= 1
                    if depth == 0:
                        return text[position + 1:cursor], cursor + 1
            cursor += 1
    elif opener == '"':
        depth, cursor = 0, position + 1
        while cursor < len(text):
            if not _escaped(text, cursor):
                if text[cursor] == '{':
                    depth += 1
                elif text[cursor] == '}':
                    depth -= 1
                elif text[cursor] == '"' and depth == 0:
                    return text[position + 1:cursor], cursor + 1
            cursor += 1
    raise ValueError(f'Unclosed BibTeX value at character {position}')


def _field_value(text: str, position: int, macros: dict[str, str]) -> tuple[str, int]:
    chunks = []
    while position < len(text):
        while position < len(text) and text[position].isspace():
            position += 1
        if position >= len(text):
            break
        if text[position] in '{"':
            chunk, position = _group(text, position)
        else:
            begin = position
            while position < len(text) and text[position] not in ',#\r\n':
                position += 1
            chunk = text[begin:position].strip()
            chunk = macros.get(chunk.lower(), chunk)
        chunks.append(chunk)
        while position < len(text) and text[position].isspace():
            position += 1
        if position >= len(text) or text[position] != '#':
            break
        position += 1
    return ''.join(chunks), position


def _fields(body: str, macros: dict[str, str]) -> dict[str, str]:
    fields, position = {}, 0
    while (position := _skip_space(body, position)) < len(body):
        match = re.match(r'([\w-]+)\s*=\s*', body[position:])
        if not match:
            raise ValueError(f'Malformed BibTeX field near {body[position:position + 80]!r}')
        name = match.group(1).lower()
        position += match.end()
        value, position = _field_value(body, position, macros)
        if name in fields:
            raise ValueError(f'Duplicate BibTeX field {name!r}')
        fields[name] = value
    return fields


def parse_bibtex(text: str) -> list[dict]:
    """Parse entries with nested braces, quoted values, comments and strings."""
    entries, macros, cursor = [], {}, 0
    pattern = re.compile(r'(?m)^\s*@(\w+)\s*([({])')
    while match := pattern.search(text, cursor):
        kind, opening = match.group(1).lower(), match.group(2)
        start, position = match.start(), match.end()
        # Entry braces are distinct from braces used inside a parenthesised entry.
        braces, parentheses, quoted = (1 if opening == '{' else 0), (1 if opening == '(' else 0), False
        end = None
        while position < len(text):
            character = text[position]
            if not _escaped(text, position):
                if character == '%' and not quoted and braces == (1 if opening == '{' else 0):
                    newline = text.find('\n', position)
                    if newline < 0:
                        break
                    position = newline
                elif character == '"' and braces == (1 if opening == '{' else 0):
                    quoted = not quoted
                elif character == '{':
                    braces += 1
                elif character == '}':
                    braces -= 1
                    if opening == '{' and braces == 0 and not quoted:
                        end = position + 1
                        break
                elif opening == '(' and braces == 0 and not quoted:
                    if character == '(':
                        parentheses += 1
                    elif character == ')':
                        parentheses -= 1
                        if parentheses == 0:
                            end = position + 1
                            break
            position += 1
        if end is None:
            raise ValueError(f'Unclosed BibTeX entry at character {start}')
        body = text[match.end():end - 1].strip()
        cursor = end
        if kind in {'comment', 'preamble'}:
            continue
        if kind == 'string':
            macros.update(_fields(body, macros))
            continue
        key, separator, field_body = body.partition(',')
        if not separator or not key.strip():
            raise ValueError(f'Missing citation key at character {start}')
        entries.append({'key': key.strip(), 'type': kind, 'fields': _fields(field_body, macros),
                        'bibtex': text[start:end].strip()})
    keys = [entry['key'] for entry in entries]
    if len(keys) != len(set(keys)):
        raise ValueError('Duplicate citation key in BibTeX source')
    return entries


_ACCENTS = {'\'': '\u0301', '`': '\u0300', '"': '\u0308', '^': '\u0302',
            '~': '\u0303', '=': '\u0304', '.': '\u0307', 'u': '\u0306',
            'v': '\u030c', 'H': '\u030b', 'c': '\u0327', 'k': '\u0328',
            'b': '\u0331', 'd': '\u0323', 'r': '\u030a'}
_SYMBOLS = {'ss': 'ß', 'SS': 'ẞ', 'l': 'ł', 'L': 'Ł', 'o': 'ø', 'O': 'Ø',
            'i': 'ı', 'j': 'ȷ', 'ae': 'æ', 'AE': 'Æ', 'oe': 'œ', 'OE': 'Œ',
            'aa': 'å', 'AA': 'Å', 'textendash': '–', 'textemdash': '—',
            'textquotesingle': "'", 'textquotedbl': '"', 'LaTeX': 'LaTeX',
            'TeX': 'TeX', 'ldots': '…', 'textasciitilde': '~', 'textbackslash': '\\'}


def latex_to_plain(text: str | None) -> str:
    """Decode TeX accents and protected groups without expanding author names."""
    text = text or ''
    result, position = [], 0
    while position < len(text):
        character = text[position]
        if character == '{':
            value, position = _group(text, position)
            result.append(latex_to_plain(value))
            continue
        if character == '\\':
            position += 1
            if position >= len(text):
                break
            if text[position].isalpha():
                command_match = re.match(r'[A-Za-z]+', text[position:])
                assert command_match
                command = command_match.group()
                position += len(command)
            else:
                command = text[position]
                position += 1
            if command in _ACCENTS:
                while position < len(text) and text[position].isspace():
                    position += 1
                if position < len(text) and text[position] == '{':
                    argument, position = _group(text, position)
                    argument = latex_to_plain(argument)
                elif position < len(text):
                    argument, position = text[position], position + 1
                else:
                    argument = ''
                if argument:
                    base = {'ı': 'i', 'ȷ': 'j'}.get(argument[0], argument[0])
                    result.append(unicodedata.normalize('NFC', base + _ACCENTS[command]) + argument[1:])
            elif command in _SYMBOLS:
                result.append(_SYMBOLS[command])
            elif len(command) == 1 and command in '_%&#${}':
                result.append(command)
            elif command in {' ', '\\', ',', ';', ':'}:
                result.append(' ')
            elif command in {'textit', 'textbf', 'textrm', 'textnormal', 'emph', 'mbox', 'url', 'mathrm'}:
                pass  # The following group is decoded on the next iteration.
            else:
                # Preserve unfamiliar named content instead of silently dropping it.
                result.append(command)
            continue
        if character == '~':
            result.append(' ')
        elif character not in '}$':
            result.append(character)
        position += 1
    return re.sub(r'\s+', ' ', ''.join(result)).strip()


def _split_top_level(text: str, separator: str) -> list[str]:
    depth, cursor, start, pieces = 0, 0, 0, []
    while cursor < len(text):
        if not _escaped(text, cursor):
            if text[cursor] == '{':
                depth += 1
            elif text[cursor] == '}':
                depth -= 1
            elif depth == 0 and text.startswith(separator, cursor):
                pieces.append(text[start:cursor].strip())
                cursor += len(separator)
                start = cursor
                continue
        cursor += 1
    pieces.append(text[start:].strip())
    return pieces


def author_names(author_field: str) -> list[str]:
    names = []
    for token in _split_top_level(author_field, ' and '):
        if not token:
            continue
        components = _split_top_level(token, ',')
        if len(components) == 2:
            name = f'{components[1]} {components[0]}'
        elif len(components) == 3:
            name = f'{components[2]} {components[0]}, {components[1]}'
        else:
            name = token
        name = latex_to_plain(name)
        if name not in names:
            names.append(name)
    return names


def citation_record(entry: dict) -> dict:
    fields = entry['fields']
    authors = author_names(fields.get('author', ''))
    title = latex_to_plain(fields.get('title', ''))
    year_text = latex_to_plain(fields.get('year', ''))
    year_match = re.search(r'\d{4}', year_text)
    year = int(year_match.group()) if year_match else None
    venue = latex_to_plain(fields.get('journal') or fields.get('booktitle')) or None
    doi = latex_to_plain(fields.get('doi')) or None
    if doi:
        doi = re.sub(r'^https?://(?:dx\.)?doi\.org/', '', doi, flags=re.IGNORECASE)
    url = latex_to_plain(fields.get('url')) or (f'https://doi.org/{doi}' if doi else None)
    prefix = f"{', '.join(authors)} ({year if year is not None else 'n.d.'})." if authors else f"({year if year is not None else 'n.d.'})."
    sections = [prefix, title.rstrip('.') + '.']
    if venue:
        sections.append(venue.rstrip('.') + '.')
    link = f'https://doi.org/{doi}' if doi else url
    if link:
        sections.append(link)
    return {'citationKey': entry['key'], 'title': title, 'authors': authors, 'year': year,
            'venue': venue, 'doi': doi, 'url': url, 'pmid': latex_to_plain(fields.get('pmid')) or None,
            'bibtex': entry['bibtex'], 'citationText': ' '.join(sections)}


def build_records(manuscript_root: Path = MANUSCRIPT_ROOT) -> tuple[dict[str, dict], list[dict]]:
    records, source_entries = {}, {}
    for filename in ['library.bib', 'library_local.bib', 'supplementary/publications.bib']:
        entries = parse_bibtex((manuscript_root / filename).read_text(encoding='utf-8-sig'))
        source_entries[filename] = entries
        for entry in entries:
            if entry['key'] in records:
                raise ValueError(f"Citation key occurs in multiple bibliographies: {entry['key']}")
            records[entry['key']] = citation_record(entry)
    included = list(source_entries['supplementary/publications.bib'])
    schlosser = next(entry for entry in source_entries['library.bib'] if entry['key'] == 'Schlosser2024_SciRep')
    included.append(schlosser)
    if len(included) != 427 or len({entry['key'] for entry in included}) != 427:
        raise ValueError('Expected exactly 427 distinct included-publication entries')
    return records, included


def write_changed(path: Path, text: str) -> None:
    if path.exists() and path.read_text(encoding='utf-8') == text:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manuscript-root', type=Path, default=MANUSCRIPT_ROOT)
    parser.add_argument('--website-root', type=Path, default=WEBSITE_ROOT)
    args = parser.parse_args()
    records, included = build_records(args.manuscript_root)
    write_changed(args.website_root / '.cache/revised-bibliography.json', json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    write_changed(args.website_root / 'public/downloads/included-studies.bib', '\n\n'.join(entry['bibtex'] for entry in included) + '\n')
    print(f'Bibliography ready: {len(included)} included publications; {len(records)} citation records.')


if __name__ == '__main__':
    main()
