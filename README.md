# Example Project

[![CI](https://github.com/throbwarm/Dev/actions/workflows/ci.yml/badge.svg)](https://github.com/throbwarm/Dev/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/throbwarm/Dev/branch/main/graph/badge.svg)](https://codecov.io/gh/throbwarm/Dev)

Este é um projeto exemplo que demonstra a estrutura padrão de desenvolvimento seguindo as melhores práticas de setup do macOS.

## Pré-requisitos

- **asdf**: Gerenciador de versões (já configurado globalmente)
- **direnv**: Carregamento automático de variáveis de ambiente
- **Node.js** e **Python**: Gerenciados via asdf

## Setup Inicial

1. **Clone e navegue para o projeto:**
   ```bash
   cd example-project
   ```

2. **Aprove o ambiente direnv:**
   ```bash
   direnv allow
   ```
   
   Isso carregará automaticamente:
   - As versões do Node.js e Python especificadas em `.tool-versions`
   - Variáveis de ambiente definidas em `.envrc`
   - Adicionará `./node_modules/.bin` ao PATH

3. **Instale as dependências:**
   ```bash
   make install
   ```

## Estrutura do Projeto

```
example-project/
├── .tool-versions      # Versões das linguagens (asdf)
├── .envrc             # Configuração do ambiente (direnv)
├── Makefile           # Tarefas de desenvolvimento
├── package.json       # Dependências Node.js
├── requirements.txt   # Dependências Python
└── README.md          # Este arquivo
```

## Comandos Disponíveis

Execute `make help` para ver todos os comandos disponíveis:

```bash
make help              # Mostra ajuda
make install           # Instala dependências
make dev              # Inicia servidor de desenvolvimento
make test             # Executa testes
make lint             # Verifica qualidade do código
make format           # Formata código
make build            # Build de produção
make clean            # Limpa arquivos gerados
```

## Workflow de Desenvolvimento

1. **Novo terminal/sessão**: direnv carrega automaticamente o ambiente
2. **Desenvolvimento**: Use `make dev` para servidor local
3. **Antes de commit**: Execute `make check` (lint + test)
4. **Build**: Use `make build` para produção

## Características

- ✅ **Isolamento**: Cada projeto tem suas próprias versões de linguagens
- ✅ **Automático**: direnv carrega ambiente ao entrar no diretório  
- ✅ **Reproduzível**: `.tool-versions` garante mesmas versões em qualquer máquina
- ✅ **Produtividade**: Makefile padroniza tarefas comuns
- ✅ **Qualidade**: Integração com linters e formatadores