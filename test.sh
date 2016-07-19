for f in ./test/*.js
do
	echo "Running test $f"
	node $f
done