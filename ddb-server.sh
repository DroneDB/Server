#!/bin/bash
set -eo pipefail
__dirname=$(cd "$(dirname "$0")"; pwd -P)
cd "${__dirname}"

platform="Linux" # Assumed
uname=$(uname)
case $uname in
	"Darwin")
	platform="MacOS / OSX"
	;;
	MINGW*)
	platform="Windows"
	;;
esac

if [[ $platform = "Windows" ]]; then
	export COMPOSE_CONVERT_WINDOWS_PATHS=1
fi

# define realpath replacement function
if [[ $platform = "MacOS / OSX" ]]; then
    realpath() {
        [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"
    }
fi

# Parse args for overrides
POSITIONAL=()
while [[ $# -gt 0 ]]
do
key="$1"

case $key in
    --port)
    export DDBS_PORT="$2"
    shift # past argument
    shift # past value
    ;;
    --hub-name)
    export DDBS_HUB_NAME="$2"
    shift # past argument
    shift # past value
    ;;
	--storage)
    DDBS_STORAGE=$(realpath "$2")
    export DDBS_STORAGE
    shift # past argument
    shift # past value
    ;;
    --ssl)
    export DDBS_SSL=YES
    shift # past argument
    ;;
    *)    # unknown option
    POSITIONAL+=("$1") # save it in an array for later
    shift # past argument
    ;;
esac
done
set -- "${POSITIONAL[@]}" # restore positional parameter

DEFAULT_PORT="5000"
DEFAULT_HUB_NAME="$(hostname)"
DEFAULT_STORAGE="$(pwd)/storage"

export DDBS_PORT="${DDBS_PORT:=${DEFAULT_PORT}}"
export DDBS_HUB_NAME="${DDBS_HUB_NAME:=${DEFAULT_HUB_NAME}}"
export DDBS_STORAGE="${DDBS_STORAGE:=${DEFAULT_STORAGE}}"

export DDBS_MODE="full"
if [[ -d "$DDBS_STORAGE/.ddb" ]]; then
    export DDBS_MODE="single"
fi
if [[ -n "$(ls -A $DDBS_STORAGE 2>/dev/null)" && ! -f "$DDBS_STORAGE/server.db" ]]; then
    export DDBS_MODE="single"
fi

usage(){
  echo "Usage: $0 <command>"
  echo
  echo "This program helps to manage the setup/teardown of the docker container for running DroneDB Server. We recommend that you read the full documentation of docker at https://docs.docker.com if you want to customize your setup."
  echo
  echo "Command list:"
  echo "	start [options]		Start DroneDB Server"
  echo "	stop			Stop DroneDB Server"
  echo "	restart		Restart DroneDB Server"
  echo "	update			Update DroneDB Server to the latest release"
  echo "	checkenv		Do an environment check and install missing components"
  echo ""
  echo "Options:"
  echo "	--port	<port>	Set the port that DroneDB Server should bind to (default: $DEFAULT_PORT)"
  echo "	--hub-name	Set the name of the server (default: $DEFAULT_HUB_NAME)"
  echo "	--storage	<path>	Path where to store all data (default: $DEFAULT_STORAGE)"
  exit
}

# $1 = command | $2 = help_text | $3 = install_command (optional)
check_command(){
	check_msg_prefix="Checking for $1... "
	check_msg_result="\033[92m\033[1m OK\033[0m\033[39m"

	hash "$1" 2>/dev/null || not_found=true
	if [[ $not_found ]]; then

		# Can we attempt to install it?
		if [[ -n "$3" ]]; then
			echo -e "$check_msg_prefix \033[93mnot found, we'll attempt to install\033[39m"
			run "$3 || sudo $3"

			# Recurse, but don't pass the install command
			check_command "$1" "$2"
		else
			check_msg_result="\033[91m can't find $1! Check that the program is installed and that you have added the proper path to the program to your PATH environment variable before launching DroneDB Server. If you change your PATH environment variable, remember to close and reopen your terminal. $2\033[39m"
		fi
	fi

	echo -e "$check_msg_prefix $check_msg_result"
	if [[ $not_found ]]; then
		return 1
	fi
}

environment_check(){
	check_command "docker" "https://www.docker.com/"
}

run(){
	echo "$1"
	eval "$1"
}

start(){
    echo "Starting DroneDB Server..."

    TGT_STORAGE=/storage
    STORAGE_OPT=""
    
    if [[ "$DDBS_MODE" == "single" ]]; then
        TGT_STORAGE="$TGT_STORAGE/$(basename $DDBS_STORAGE)"
        STORAGE_OPT="--storage-path \"$TGT_STORAGE\""
    fi

    command="docker run --rm --name ddb-server -v \"$DDBS_STORAGE\":\"$TGT_STORAGE\" -p $DDBS_PORT:$DDBS_PORT dronedb/server -p $DDBS_PORT --hub-name \"$DDBS_HUB_NAME\" $STORAGE_OPT"

	run "$command"
}

stop(){
    echo "Stopping DroneDB Server..."

    command+="docker stop ddb-server"

	run "$command"
}

if [[ $1 = "start" ]]; then
	environment_check
	start
elif [[ $1 = "stop" ]]; then
	environment_check
	stop
elif [[ $1 = "restart" ]]; then
	environment_check
	stop
	start
elif [[ $1 = "update" ]]; then
	echo "Updating DroneDB Server..."

	command="docker pull dronedb/server"
	run "$command"
	echo -e "\033[1mDone!\033[0m You can now start DroneDB Server by running $0 restart"
elif [[ $1 = "checkenv" ]]; then
	environment_check
else
	usage
fi
