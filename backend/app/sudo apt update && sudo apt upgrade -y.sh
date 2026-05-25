sudo apt update && sudo apt upgrade -y

sudo apt install software-properties-common build-essential git curl wget nodejs npm postgresql postgresql-contrib libpq-dev libxml2-dev libxslt1-dev zlib1g-dev libldap2-dev libsasl2-dev libffi-dev libjpeg-dev -y

sudo add-apt-repository ppa:deadsnakes/ppa -y

sudo apt update

sudo apt install python3.12 python3.12-venv python3.12-dev -y

sudo apt install software-properties-common -y

sudo add-apt-repository ppa:deadsnakes/ppa -y



sudo service postgresql start

sudo -u postgres psql

sudo apt purge postgresql postgresql-contrib -y


sudo pg_createcluster 18 main --start

pg_lsclusters


sudo -u postgres psql

CREATE USER salvin WITH SUPERUSER PASSWORD 'salvin123';

INSTALL & RUN Odoo

sudo apt install python3.12-venv -y

git clone https://github.com/odoo/odoo --depth 1 --branch 18.0

cd odoo

python3.12 -m venv venv

source venv/bin/activate

pip install --upgrade pip wheel setuptools

pip install -r requirements.txt

nano odoo.conf

[options]
addons_path = addons
db_host = localhost
db_port = 5432
db_user = salvin
db_password = salvin123
xmlrpc_port = 8069


python3 odoo-bin -c odoo.conf

