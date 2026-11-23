# Imagen de desarrollo/compilación para ClipStudio.
# Node + pnpm + Rust + toolchain para compilar el .exe de Windows desde Linux
# (cargo-xwin + clang/lld + NSIS) y ffmpeg para pruebas.
FROM rust:1-trixie

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates unzip xz-utils git \
      clang lld llvm nsis ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@12.21.0

RUN rustup target add x86_64-pc-windows-msvc \
    && cargo install --locked cargo-xwin

# Usuario sin privilegios con el mismo UID que el de WSL, para que los
# archivos generados en el repo no queden como root.
ARG UID=1000
ARG GID=1000
RUN groupadd -g ${GID} dev && useradd -m -u ${UID} -g ${GID} dev \
    && mkdir -p /app/node_modules /app/src-tauri/target /xwin-cache /pnpm-store \
    && chown -R dev:dev /app /xwin-cache /pnpm-store /usr/local/cargo

ENV XWIN_CACHE_DIR=/xwin-cache \
    npm_config_store_dir=/pnpm-store \
    CI=true
USER dev
WORKDIR /app
