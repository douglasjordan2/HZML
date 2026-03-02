#include "tree_sitter/parser.h"
#include <string.h>

enum TokenType {
  SERVER_CONTENT,
  TEMPLATE_CONTENT,
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

bool tree_sitter_hzml_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols) {

  if (valid_symbols[SERVER_CONTENT]) {
    lexer->result_symbol = SERVER_CONTENT;
    return scan_raw_text(lexer, "server");
  }

  if (valid_symbols[TEMPLATE_CONTENT]) {
    lexer->result_symbol = TEMPLATE_CONTENT;
    return scan_raw_text(lexer, "template");
  }

  return false;
}
