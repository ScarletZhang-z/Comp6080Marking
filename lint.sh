#!/bin/bash

for group in $(cat groups); do
    cd $group/airbrb/frontend
    echo "==========================" >> ../../../lint.txt
    echo $group >> ../../../lint.txt
    echo "==========================" >> ../../../lint.txt
    npm run lint >> ../../../lint.txt
    
    cd ../../../
done