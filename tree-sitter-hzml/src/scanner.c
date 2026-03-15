#include "tree_sitter/parser.h"
#include <string.h>

enum TokenType {
  SERVER_CONTENT,
  LOADER_CONTENT,
  TEMPLATE_TEXT,
  EXPRESSION_CONTENT,
};

void *tree_sitter_hzml_external_scanner_create() { return NULL; }
void tree_sitter_hzml_external_scanner_destroy(void *p) {}
unsigned tree_sitter_hzml_external_scanner_serialize(void *p, char *b) { return 0; }
void tree_sitter_hzml_external_scanner_deserialize(void *p, const char *b, unsigned n) {}

static bool scan_raw_text(TSLexer *lexer, const char *end_tag) {
  unsigned tag_len = strlen(end_tag);
  bool has_content = false;

  while (lexer->lookahead != 0) {
    if (lexer->lookahead == '<') {
      lexer->mark_end(lexer);
      lexer->advance(lexer, false);

      if (lexer->lookahead == '/') {
        lexer->advance(lexer, false);

        bool match = true;
        for (unsigned i = 0; i < tag_len; i++) {
          if (lexer->lookahead != (int32_t)end_tag[i]) {
            match = false;
            break;
          }
          lexer->advance(lexer, false);
        }

        if (match && lexer->lookahead == '>') {
          return has_content;
        }
      }

      has_content = true;
    } else {
      lexer->advance(lexer, false);
      has_content = true;
    }
  }

  if (has_content) {
    lexer->mark_end(lexer);
  }

  return has_content;
}

static bool scan_template_text(TSLexer *lexer) {
  bool has_content = false;

  while (lexer->lookahead != 0) {
    if (lexer->lookahead == '<') {
      lexer->mark_end(lexer);
      lexer->advance(lexer, false);

      if (lexer->lookahead == '$') {
        return has_content;
      }

      if (lexer->lookahead == '/') {
        lexer->advance(lexer, false);

        if (lexer->lookahead == '$') {
          return has_content;
        }

        if (lexer->lookahead == '/') {
          return has_content;
        }

        if (lexer->lookahead == 't') {
          const char *rest = "emplate>";
          bool match = true;
          lexer->advance(lexer, false);
          for (int i = 0; rest[i]; i++) {
            if (lexer->lookahead != (int32_t)rest[i]) {
              match = false;
              break;
            }
            lexer->advance(lexer, false);
          }
          if (match) {
            return has_content;
          }
        }
      }

      has_content = true;
      continue;
    }

    if (lexer->lookahead == '$') {
      lexer->mark_end(lexer);
      lexer->advance(lexer, false);

      if (lexer->lookahead == '{') {
        return has_content;
      }

      has_content = true;
      continue;
    }

    lexer->advance(lexer, false);
    has_content = true;
  }

  if (has_content) {
    lexer->mark_end(lexer);
  }

  return has_content;
}

static bool scan_expression_content(TSLexer *lexer) {
  int depth = 0;
  bool has_content = false;

  while (lexer->lookahead != 0) {
    switch (lexer->lookahead) {
      case '}':
        if (depth == 0) {
          lexer->mark_end(lexer);
          return has_content;
        }
        depth--;
        break;

      case '{':
        depth++;
        break;

      case '"':
      case '\'': {
        int32_t quote = lexer->lookahead;
        lexer->advance(lexer, false);
        has_content = true;
        while (lexer->lookahead != 0 && lexer->lookahead != quote) {
          if (lexer->lookahead == '\\') {
            lexer->advance(lexer, false);
            has_content = true;
          }
          if (lexer->lookahead != 0) {
            lexer->advance(lexer, false);
            has_content = true;
          }
        }
        if (lexer->lookahead == quote) {
          lexer->advance(lexer, false);
          has_content = true;
        }
        continue;
      }

      case '`': {
        lexer->advance(lexer, false);
        has_content = true;
        int tmpl_depth = 0;
        while (lexer->lookahead != 0) {
          if (lexer->lookahead == '\\') {
            lexer->advance(lexer, false);
            has_content = true;
            if (lexer->lookahead != 0) {
              lexer->advance(lexer, false);
              has_content = true;
            }
            continue;
          }
          if (lexer->lookahead == '$') {
            lexer->advance(lexer, false);
            has_content = true;
            if (lexer->lookahead == '{') {
              tmpl_depth++;
              lexer->advance(lexer, false);
              has_content = true;
              continue;
            }
            continue;
          }
          if (lexer->lookahead == '}' && tmpl_depth > 0) {
            tmpl_depth--;
            lexer->advance(lexer, false);
            has_content = true;
            continue;
          }
          if (lexer->lookahead == '`' && tmpl_depth == 0) {
            lexer->advance(lexer, false);
            has_content = true;
            break;
          }
          lexer->advance(lexer, false);
          has_content = true;
        }
        continue;
      }
    }

    lexer->advance(lexer, false);
    has_content = true;
  }

  return false;
}

bool tree_sitter_hzml_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols) {

  if (valid_symbols[SERVER_CONTENT] && valid_symbols[LOADER_CONTENT] &&
      valid_symbols[TEMPLATE_TEXT] && valid_symbols[EXPRESSION_CONTENT]) {
    return false;
  }

  if (valid_symbols[SERVER_CONTENT]) {
    lexer->result_symbol = SERVER_CONTENT;
    return scan_raw_text(lexer, "server");
  }

  if (valid_symbols[LOADER_CONTENT]) {
    lexer->result_symbol = LOADER_CONTENT;
    return scan_raw_text(lexer, "loader");
  }

  if (valid_symbols[EXPRESSION_CONTENT]) {
    lexer->result_symbol = EXPRESSION_CONTENT;
    return scan_expression_content(lexer);
  }

  if (valid_symbols[TEMPLATE_TEXT]) {
    lexer->result_symbol = TEMPLATE_TEXT;
    return scan_template_text(lexer);
  }

  return false;
}
