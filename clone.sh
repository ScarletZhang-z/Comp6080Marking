#!/bin/bash

for group in $(cat groups); do
    mkdir $group
    cd $group
    git clone git@nw-syd-gitlab.cseunsw.tech:COMP6080/25T3/groups/$group/airbrb.git airbrb
    cd airbrb/frontend
    npm i
    cd ../
    cd backend
    npm i
    cd ../../../
done