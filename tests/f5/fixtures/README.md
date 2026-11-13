# Fixtures

Fixtures for F5 are built in memory by `tests/f5/test_extract.py` (`build_eml` /
raw MIME strings). No real mail, no stored `.eml` files, and no literal shell
payload strings — Windows endpoint protection quarantines those on write, which
would break the test run for a reason unrelated to the code.
