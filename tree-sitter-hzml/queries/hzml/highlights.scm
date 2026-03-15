["<server>" "</server>" "<loader>" "</loader>" "<template>" "</template>"] @keyword

(htm_component "<" @tag.delimiter)
(htm_component ">" @tag.delimiter)
(htm_component "/>" @tag.delimiter)

(htm_close_tag "</" @tag.delimiter)
(htm_close_tag ">" @tag.delimiter)
(htm_close_tag "<//>" @tag.delimiter)

(htm_tag_name "${" @punctuation.special)
(htm_tag_name "}" @punctuation.special)
(htm_tag_name (expression_content) @type)

(htm_attribute_name) @tag.attribute

(htm_quoted_value) @string

(htm_expression "${" @punctuation.special)
(htm_expression "}" @punctuation.special)

(htm_expression_value "{" @punctuation.special)
(htm_expression_value "}" @punctuation.special)
