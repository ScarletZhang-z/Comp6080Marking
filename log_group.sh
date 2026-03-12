#!/bin/bash

for group in $(cat groups); do
    cd $group/airbrb

    echo "==========================" >> ../../output.txt
    echo $group >> ../../output.txt
    echo "==========================" >> ../../output.txt
    echo "CONTRIBUTORS" >> ../../output.txt
    git shortlog --summary --numbered --all --no-merges >> ../../output.txt
    echo "COMMIT LINES (ADDITIONS - DELETIONS)" >> ../../output.txt
    git log --numstat | grep -E "^[2-9][0-9][0-9]" >> ../../output.txt
    echo "UNIQUE DAYS COMMITTED" >> ../../output.txt
    git log --date=short | awk '!/Author: (ben|Ben|Hayden|Christian)/, !/Date: .*/' | awk '/Author: .*/, /Date: .*/' | grep -o [0-9]*-[0-9]*-[0-9]* | sort | uniq -c | wc -l >> ../../output.txt
    echo "COMMIT DESCRIPTION" >> ../../output.txt
    git log --oneline >> ../../output.txt
    echo "==========================" >> ../../output.txt
    cd ../../
done