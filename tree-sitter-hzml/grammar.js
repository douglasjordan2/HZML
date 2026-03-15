module.exports = grammar({
  name: "hzml",

  externals: $ => [
    $.server_content,
    $.loader_content,
    $.template_text,
    $.expression_content,
  ],

  extras: $ => [/\s/],

  rules: {
    source_file: $ => seq(
      optional($.server_block),
      optional($.loader_block),
      optional($.template_block),
    ),

    server_block: $ => seq(
      "<server>",
      optional($.server_content),
      "</server>",
    ),

    loader_block: $ => seq(
      "<loader>",
      optional($.loader_content),
      "</loader>",
    ),

    template_block: $ => seq(
      "<template>",
      repeat($._template_node),
      "</template>",
    ),

    _template_node: $ => choice(
      $.htm_component,
      $.htm_close_tag,
      $.htm_expression,
      $.template_text,
    ),

    htm_component: $ => seq(
      "<",
      $.htm_tag_name,
      repeat($.htm_attribute),
      choice("/>", ">"),
    ),

    htm_close_tag: $ => choice(
      seq("</", $.htm_tag_name, ">"),
      "<//>",
    ),

    htm_expression: $ => seq("${", $.expression_content, "}"),

    htm_tag_name: $ => seq("${", $.expression_content, "}"),

    htm_attribute: $ => seq(
      $.htm_attribute_name,
      optional(seq("=", $._htm_attribute_value)),
    ),

    htm_attribute_name: $ => /[a-zA-Z_][a-zA-Z0-9_-]*/,

    _htm_attribute_value: $ => choice(
      $.htm_quoted_value,
      $.htm_expression_value,
    ),

    htm_quoted_value: $ => /"[^"]*"/,

    htm_expression_value: $ => seq("{", $.expression_content, "}"),
  },
});
