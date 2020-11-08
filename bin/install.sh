#!/bin/bash

function install_packages {
  apt update && apt upgrade -y -o Dpkg::Options::=--force-confnew
  apt install mongodb redis-server -y
}

function install_node {
  curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash - && apt install -y nodejs
  npm i -g npm
}

install_packages
install_node
