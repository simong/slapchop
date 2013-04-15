#!/bin/bash

sakaigerproduction_activity_cache_master="37.153.97.194"
sakaigerproduction_activity_cache_master_internal="10.224.14.62"
sakaigerproduction_cache_master="37.153.96.148"
sakaigerproduction_cache_master_internal="10.224.14.63"
sakaigerproduction_cache_slave="37.153.97.195"
sakaigerproduction_cache_slave_internal="10.224.14.73"
sakaigerproduction_app0="37.153.96.138"
sakaigerproduction_app0_internal="10.224.14.64"
sakaigerproduction_activity0="37.153.97.254"
sakaigerproduction_activity0_internal="10.224.14.65"
sakaigerproduction_pp0="37.153.96.19"
sakaigerproduction_pp0_internal="10.224.14.66"
sakaigerproduction_db0="37.153.96.147"
sakaigerproduction_db0_internal="10.224.14.67"
sakaigerproduction_mq_master="37.153.96.221"
sakaigerproduction_mq_master_internal="10.224.14.68"
sakaigerproduction_search0="37.153.96.58"
sakaigerproduction_search0_internal="10.224.14.69"
sakaigerproduction_puppet="37.153.97.44"
sakaigerproduction_puppet_internal="10.224.14.70"
sakaigerproduction_syslog="37.153.96.116"
sakaigerproduction_syslog_internal="10.224.14.71"
sakaigerproduction_web0="37.153.96.162"
sakaigerproduction_web0_internal="10.224.14.72"

# 1. First, run the before-reboot bootstrap script on the puppet master
# ssh -oStrictHostKeyChecking=no root@37.153.97.44 "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/puppetmaster-beforereboot.sh | bash"

# 2. Reboot the puppet machine. You can do that with a command like this:
# node slapchop.js -a sakaiger -d eu-ams-1 -f puppet reboot

# 3. Then you need to do the after-reboot bootstrap script, which actually installs things. Hooray!
# ssh -oStrictHostKeyChecking=no root@$37.153.97.44 "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/puppetmaster-afterreboot.sh | bash"

# Now you can actually run the following stuff to bootstrap the other nodes:
# ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_activity_cache_master "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance activity-cache-master $sakaigerproduction_puppet_internal" &
#ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_cache_master "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance cache-master $sakaigerproduction_puppet_internal" &
ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_cache_slave "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance cache-slave $sakaigerproduction_puppet_internal" &
#ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_app0 "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance app0 $sakaigerproduction_puppet_internal" &
#ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_activity0 "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance activity0 $sakaigerproduction_puppet_internal" &
#ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_pp0 "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance pp0 $sakaigerproduction_puppet_internal" &
#ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_db0 "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance db0 $sakaigerproduction_puppet_internal" &
#ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_mq_master "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance mq-master $sakaigerproduction_puppet_internal" &
#ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_search0 "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance search0 $sakaigerproduction_puppet_internal" &
#ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_syslog "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance syslog $sakaigerproduction_puppet_internal" &
#ssh -oStrictHostKeyChecking=no root@$sakaigerproduction_web0 "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance web0 $sakaigerproduction_puppet_internal" &