((server_block
  (server_content) @injection.content)
 (#set! injection.language "typescript"))

((loader_block
  (loader_content) @injection.content)
 (#set! injection.language "typescript"))

((template_text) @injection.content
 (#set! injection.language "html")
 (#set! injection.combined))

((expression_content) @injection.content
 (#set! injection.language "typescript"))
