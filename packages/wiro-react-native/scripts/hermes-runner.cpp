// Runs one JavaScript file in the Hermes VM that React Native apps embed.
// React Native 0.88 ships the Hermes compiler only, so
// verify-hmac-hermes.mjs links this file against hermesvm.framework.
#include <hermes/hermes.h>
#include <jsi/jsi.h>

#include <exception>
#include <fstream>
#include <iostream>
#include <iterator>
#include <memory>
#include <string>

int main(int argc, char **argv) {
  if (argc != 2) {
    std::cerr << "usage: hermes-runner <script.js>\n";
    return 2;
  }

  std::ifstream file(argv[1], std::ios::binary);
  if (!file) {
    std::cerr << "Could not read " << argv[1] << "\n";
    return 2;
  }
  std::string source((std::istreambuf_iterator<char>(file)),
                     std::istreambuf_iterator<char>());

  auto runtime = facebook::hermes::makeHermesRuntime();
  try {
    runtime->evaluateJavaScript(
        std::make_shared<facebook::jsi::StringBuffer>(std::move(source)),
        argv[1]);
  } catch (const facebook::jsi::JSError &error) {
    std::cerr << error.getMessage() << "\n" << error.getStack() << "\n";
    return 1;
  } catch (const std::exception &error) {
    std::cerr << error.what() << "\n";
    return 1;
  }
  return 0;
}
